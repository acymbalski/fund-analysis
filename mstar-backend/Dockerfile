FROM python:3.12-slim

# Install Chromium + chromedriver via apt (keeps driver/browser versions in sync)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    # Required by Selenium in headless Linux containers
    libglib2.0-0 \
    libnss3 \
    libgconf-2-4 \
    libfontconfig1 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Point Selenium to the system Chromium binary
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver

# Enable headless + container-safe flags for mstarpy's browser_options().
# mstarpy reads SELENIUM_CHROME_FLAGS and appends them to Chrome options.
ENV SELENIUM_CHROME_FLAGS="--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-blink-features=AutomationControlled"

# Tune Selenium wait time (seconds Chrome stays open to collect cookies + login)
ENV SELENIUM_DRIVER_WAIT_TIME=6

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
