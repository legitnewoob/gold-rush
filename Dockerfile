FROM python:3.13-slim

# Install Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY gold-rush-python/requirements.txt ./gold-rush-python/requirements.txt
RUN pip install --no-cache-dir -r gold-rush-python/requirements.txt

# Copy Python scraper
COPY gold-rush-python/tanishq_gold_scraper.py ./gold-rush-python/tanishq_gold_scraper.py

# Install Node dependencies (none currently, but respects package-lock if added later)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy Node source
COPY src/ ./src/
COPY index.js ./

# Update the Python bin path to use system Python (not venv)
ENV PYTHONPATH=/app

# Data directory (mount a volume here to persist history across restarts)
VOLUME /app/data

CMD ["node", "index.js"]
