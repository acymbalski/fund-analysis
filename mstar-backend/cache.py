"""Shared in-memory TTL caches. Module-level so all routes share state."""
import threading
from cachetools import TTLCache

_lock = threading.Lock()

# Session store: token (str) → AuthedMorningstarSession
# 8hr TTL, max 50 concurrent users (personal tool)
sessions: TTLCache = TTLCache(maxsize=50, ttl=28_800)

# Fund data caches — keyed by ticker (or "ticker:range" for chart).
# 24hr TTL: prices and metadata are stale-safe for a trading day.
charts: TTLCache = TTLCache(maxsize=500, ttl=86_400)
summaries: TTLCache = TTLCache(maxsize=500, ttl=86_400)

# Morningstar security code cache: ticker → mstarpy Funds instance
# Avoids repeated screener lookups (the slow/expensive call).
# Shorter TTL since tickers can change underlying security.
fund_instances: TTLCache = TTLCache(maxsize=500, ttl=86_400)

lock = _lock
