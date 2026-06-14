"""
mstar-backend — FastAPI service wrapping mstarpy for the funds screener.

Endpoints:
  POST /auth                     → create session from credentials, return token
  GET  /fund/{ticker}/chart      → { timestamps, prices }
  GET  /fund/{ticker}/summary    → normalized fund metadata
  GET  /health                   → { status, sessions }

Auth model:
  - Backend starts with zero credentials.
  - Client POSTs email/password → backend creates Selenium session, discards
    credentials immediately, returns opaque Bearer token.
  - Token maps to in-memory session (8hr TTL). Restart invalidates all tokens.
"""
import datetime
import re
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import cache
from session import AuthedMorningstarSession

app = FastAPI(title="mstar-backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://funds.cymbal.ski",
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5500",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/auth")
def auth(req: AuthRequest):
    """
    Create an authenticated Morningstar session.
    Credentials are used once to log in via Selenium, then discarded.
    Returns a Bearer token valid for 8 hours.
    """
    try:
        session = AuthedMorningstarSession(req.email, req.password)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Login failed: {exc}")

    token = str(uuid.uuid4())
    with cache.lock:
        cache.sessions[token] = session
    return {"token": token}


def get_session(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[7:]
    with cache.lock:
        session = cache.sessions.get(token)
    if session is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid — re-authenticate")
    return session


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    with cache.lock:
        n = len(cache.sessions)
    return {"status": "ok", "active_sessions": n}


# ── Fund helpers ──────────────────────────────────────────────────────────────

def _get_fund(ticker: str, session):
    """
    Return a mstarpy Funds instance for this ticker, using the provided session.
    Caches the instance per (ticker, session_id) for 24hr to avoid repeated
    screener calls (the slow Morningstar lookup).
    """
    # Key on session identity + ticker
    cache_key = f"{id(session)}:{ticker.upper()}"
    with cache.lock:
        existing = cache.fund_instances.get(cache_key)
    if existing is not None:
        return existing

    from mstarpy import Funds
    # Funds.__init__ calls screener_universe() — this is the previously-broken call
    # that now works because our AuthedMorningstarSession is logged in.
    fund = Funds(ticker, session=session)

    with cache.lock:
        cache.fund_instances[cache_key] = fund
    return fund


def _parse_range(range_str: str) -> tuple[datetime.datetime, datetime.datetime]:
    end = datetime.datetime.today()
    m = re.fullmatch(r"(\d+)([ydm])", range_str.lower())
    if not m:
        raise ValueError(f"Invalid range: {range_str!r}. Use e.g. '10y', '2y', '6m'.")
    n, unit = int(m.group(1)), m.group(2)
    if unit == "y":
        start = end - datetime.timedelta(days=365 * n)
    elif unit == "m":
        start = end - datetime.timedelta(days=30 * n)
    else:
        start = end - datetime.timedelta(days=n)
    return start, end


# ── Chart endpoint ────────────────────────────────────────────────────────────

@app.get("/fund/{ticker}/chart")
def get_chart(ticker: str, range: str = "10y", session=Depends(get_session)):
    """
    Return daily NAV/price history.
    Shape: { timestamps: string[] (ISO dates), prices: number[] }
    """
    ticker = ticker.upper()
    cache_key = f"{ticker}:{range}"
    with cache.lock:
        cached = cache.charts.get(cache_key)
    if cached is not None:
        return cached

    start, end = _parse_range(range)
    fund = _get_fund(ticker, session)

    try:
        nav_data = fund.nav(start, end, frequency="daily")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"nav() failed for {ticker}: {exc}")

    # nav() returns list[dict]. Exact keys depend on mstarpy version.
    # Common shapes: {"date": date, "nav": float, "totalReturn": float}
    # or {"Date": str, "NAV": float}. We try both.
    timestamps = []
    prices = []
    for row in (nav_data or []):
        raw_date = row.get("date") or row.get("Date")
        raw_price = (
            row.get("totalReturn")   # prefer total return (includes dividends)
            or row.get("nav")
            or row.get("NAV")
            or row.get("close")
        )
        if raw_date is None or raw_price is None:
            continue
        # Normalize date to ISO string
        if hasattr(raw_date, "strftime"):
            ts_str = raw_date.strftime("%Y-%m-%d")
        else:
            ts_str = str(raw_date)[:10]
        timestamps.append(ts_str)
        prices.append(float(raw_price))

    if len(prices) < 2:
        raise HTTPException(status_code=502, detail=f"Insufficient NAV data for {ticker}")

    result = {"timestamps": timestamps, "prices": prices}
    with cache.lock:
        cache.charts[cache_key] = result
    return result


# ── Summary endpoint ──────────────────────────────────────────────────────────

def _safe_float(val, fallback=None):
    try:
        return float(val) if val is not None else fallback
    except (TypeError, ValueError):
        return fallback


def _safe_int(val, fallback=0):
    try:
        return int(val) if val is not None else fallback
    except (TypeError, ValueError):
        return fallback


@app.get("/fund/{ticker}/summary")
def get_summary(ticker: str, session=Depends(get_session)):
    """
    Return normalized fund metadata.
    Shape mirrors what parseMorningstarSummary() in calc.js expects — all fields
    pre-extracted so the frontend does minimal parsing.

    NOTE: dataPoint() field names below are derived from mstarpy docs/examples.
    Some may need adjustment based on live API responses. Log the raw values
    on first run to verify.
    """
    ticker = ticker.upper()
    with cache.lock:
        cached = cache.summaries.get(ticker)
    if cached is not None:
        return cached

    fund = _get_fund(ticker, session)

    def dp(*fields):
        """Try dataPoint() with multiple field name candidates, return first non-None."""
        for field in fields:
            try:
                rows = fund.dataPoint(field)
                if rows and isinstance(rows, list) and rows[0].get("fields"):
                    val = rows[0]["fields"].get(field, {})
                    if isinstance(val, dict):
                        return val.get("value")
                    return val
            except Exception:
                pass
        return None

    # ── Name ─────────────────────────────────────────────────────────────────
    name = fund.name or ticker

    # ── Category ─────────────────────────────────────────────────────────────
    category = dp("categoryName", "morningstarCategoryId") or "—"

    # ── Manager / fund family ─────────────────────────────────────────────────
    manager = dp("companyName", "brandingCompanyId", "fundFamily") or "—"

    # ── Inception date ────────────────────────────────────────────────────────
    raw_inception = dp("inceptionDate")
    inception = "—"
    if raw_inception:
        try:
            if isinstance(raw_inception, str):
                inception = raw_inception[:10]
            elif hasattr(raw_inception, "strftime"):
                inception = raw_inception.strftime("%Y-%m-%d")
        except Exception:
            pass

    # ── Expense ratio (decimal, e.g. 0.0003 = 0.03%) ─────────────────────────
    exp_ratio = _safe_float(
        dp("annualReport_NetExpenseRatio", "ongoingCharge", "expenseRatio"), 0
    )

    # ── Turnover ──────────────────────────────────────────────────────────────
    turnover = _safe_float(dp("portfolioTurnoverRatio", "annualTurnover"))

    # ── AUM (return in billions) ──────────────────────────────────────────────
    raw_aum = _safe_float(dp("totalNetAssets", "totalAssets"), 0)
    aum = raw_aum / 1e9 if raw_aum > 1e6 else raw_aum  # already in billions if small

    # ── Current price/NAV ─────────────────────────────────────────────────────
    price = _safe_float(dp("nav", "closePrice", "price"))

    # ── Number of holdings ────────────────────────────────────────────────────
    num_holdings = _safe_int(dp("numberOfHoldings", "totalNumberOfHoldings"))

    # ── Morningstar star rating (1–5) ─────────────────────────────────────────
    ms_stars = _safe_int(dp("starRating", "ratingOverall"))

    # ── Analyst rating (Gold/Silver/Bronze/Neutral/Negative) ──────────────────
    ms_analyst = "—"
    try:
        ar = fund.analystRating()
        if ar and isinstance(ar, list):
            # Shape varies; look for a 'rating' or 'analystRating' key
            first = ar[0]
            ms_analyst = (
                first.get("rating")
                or first.get("analystRating")
                or first.get("morningstarAnalystRating")
                or "—"
            )
    except Exception:
        pass

    # ── Holdings (top 10 as [[symbol, pct], ...]) ─────────────────────────────
    holdings = []
    try:
        df = fund.holdings(holdingType="all")
        if df is not None and not df.empty:
            # Column names vary across mstarpy versions
            sym_col = next((c for c in df.columns if "symbol" in c.lower() or "holdingid" in c.lower()), None)
            pct_col = next((c for c in df.columns if "weighting" in c.lower() or "percent" in c.lower()), None)
            if sym_col and pct_col:
                for _, row in df.head(10).iterrows():
                    sym = str(row[sym_col]).strip()
                    pct = _safe_float(row[pct_col], 0)
                    # mstarpy returns weighting as decimal (0.065) or percent (6.5)
                    if pct < 1:
                        pct = round(pct * 100, 2)
                    if sym and sym not in ("nan", "—", ""):
                        holdings.append([sym, round(pct, 2)])
    except Exception as exc:
        print(f"[mstar-backend] holdings() failed for {ticker}: {exc}")

    # ── Sector allocation (as [[name, pct], ...]) ─────────────────────────────
    sectors = []
    try:
        alloc = fund.allocationMap()
        # allocationMap() returns nested dict; structure varies by version.
        # Common shape: {"portfolio": {"assetAllocation": {...}}} or flat sector dict.
        # We try to extract the equity sector breakdown.
        raw_sectors = (
            alloc.get("EQUITY_STYLE_SECTOR")
            or alloc.get("equityStyleSector")
            or alloc.get("sectors")
            or alloc.get("portfolio", {}).get("sectors")
            or {}
        )
        if isinstance(raw_sectors, dict):
            for name_raw, val in raw_sectors.items():
                pct = _safe_float(val.get("value") if isinstance(val, dict) else val, 0)
                if pct < 1:
                    pct = round(pct * 100, 2)
                # Convert camelCase → Title Case
                label = re.sub(r"([A-Z])", r" \1", name_raw).strip().title()
                if pct > 0:
                    sectors.append([label, round(pct, 2)])
        sectors.sort(key=lambda x: x[1], reverse=True)
    except Exception as exc:
        print(f"[mstar-backend] allocationMap() failed for {ticker}: {exc}")

    # ── Benchmark ticker (category-based, returned for frontend use) ──────────
    # Frontend's getBenchmark() handles this from category, but we provide it
    # here so the Morningstar category string feeds the same lookup.
    result = {
        "name": name,
        "category": category,
        "manager": manager,
        "inception": inception,
        "expRatio": exp_ratio,
        "turnover": turnover,
        "aum": aum,
        "price": price,
        "numHoldings": num_holdings or None,
        "msStars": ms_stars,
        "msAnalyst": ms_analyst,
        "holdings": holdings,
        "sectors": sectors,
    }

    with cache.lock:
        cache.summaries[ticker] = result
    return result
