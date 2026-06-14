"""
AuthedMorningstarSession — subclass of mstarpy's MorningstarSession that performs
a full credential login before extracting cookies.

Fixes mstarpy issue #45: the screener API returns 401 without an authenticated session.

Credential lifecycle:
  1. Caller passes email/password to __init__
  2. super().__init__() triggers _init_browser_session() (our override)
  3. Override reads and immediately deletes credentials from self
  4. Selenium logs in, cookies extracted, driver closes
  5. Credentials never stored after step 3 — only session cookies remain
"""
import os
import time

from mstarpy.search import MorningstarSession
from mstarpy.utils import get_webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


WAIT = float(os.environ.get("SELENIUM_DRIVER_WAIT_TIME", "6"))


class AuthedMorningstarSession(MorningstarSession):
    def __init__(self, email: str, password: str):
        # Store temporarily; _init_browser_session (called by super) reads + deletes them.
        self._pending_email = email
        self._pending_password = password
        super().__init__()

    def _init_browser_session(self):
        # Pop credentials immediately — they will not persist on self after this point.
        email = self.__dict__.pop("_pending_email", None)
        password = self.__dict__.pop("_pending_password", None)

        with get_webdriver() as driver:
            wait = WebDriverWait(driver, 20)

            if email and password:
                try:
                    driver.get("https://www.morningstar.com/sign-in")
                    time.sleep(2)

                    # Field selectors verified against morningstar.com/sign-in as of 2025-06.
                    # If login breaks, inspect the page and update these selectors.
                    email_field = wait.until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email'], input[name='email'], #email"))
                    )
                    email_field.clear()
                    email_field.send_keys(email)

                    pw_field = driver.find_element(By.CSS_SELECTOR, "input[type='password'], input[name='password'], #password")
                    pw_field.send_keys(password)

                    submit = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                    submit.click()

                    time.sleep(WAIT)
                except Exception as exc:
                    print(f"[mstar-session] Login attempt failed: {exc}")
                    print("[mstar-session] Continuing with unauthenticated cookies.")

            # Visit global.morningstar.com to pick up screener-domain cookies.
            driver.get("https://global.morningstar.com")
            time.sleep(WAIT)

            cookies = driver.get_cookies()
            user_agent = driver.execute_script("return navigator.userAgent")

        self.cookies.clear()
        for c in cookies:
            self.cookies.set(c["name"], c["value"])

        self.headers.update({
            "User-Agent": user_agent,
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://global.morningstar.com/",
            "Origin": "https://global.morningstar.com",
        })
