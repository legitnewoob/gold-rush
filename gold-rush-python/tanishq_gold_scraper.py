"""
Tanishq Gold Rate Scraper
--------------------------
Scrapes current gold rates and the recent rate-history table from
https://www.tanishq.co.in/gold-rate.html

Usage:
    pip install curl_cffi beautifulsoup4 lxml
    python tanishq_gold_scraper.py

Notes:
- The page is server-rendered (Salesforce Commerce Cloud / SFRA storefront),
  so a GET request returns the fully populated HTML — no need for
  Selenium/Playwright. Tanishq's WAF blocks plain requests/curl by TLS
  fingerprint regardless of headers, so curl_cffi (impersonate="chrome")
  is used instead of the `requests` library.
- Be a good citizen: don't hammer the site. This script makes ONE request.
  If you plan to poll regularly, cache results and check for a public API
  before scraping repeatedly, and respect robots.txt / their ToS.
"""

import re
import sys
import json
import time
import csv
from datetime import datetime, timezone

from curl_cffi import requests
from bs4 import BeautifulSoup

URL = "https://www.tanishq.co.in/gold-rate.html?lang=en_IN"

HEADERS = {
    "Accept-Language": "en-IN,en;q=0.9",
}


def fetch_page(url: str, retries: int = 3, backoff: float = 2.0) -> str:
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            # impersonate="chrome" matches a real Chrome TLS/HTTP2 fingerprint —
            # Tanishq's WAF 403s plain requests/curl regardless of headers sent.
            resp = requests.get(url, headers=HEADERS, timeout=15, impersonate="chrome")
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            last_exc = e
            print(f"[attempt {attempt}] fetch failed: {e}")
            time.sleep(backoff * attempt)
    raise RuntimeError(f"Failed to fetch page after {retries} attempts") from last_exc


def clean_number(text: str):
    """Extract a plain number from strings like '₹  14645      +395    (+2.77%)'."""
    if not text:
        return None
    match = re.search(r"[\d,]+(?:\.\d+)?", text.replace("\xa0", " "))
    if not match:
        return None
    return float(match.group(0).replace(",", ""))


def parse_current_for_karat(soup: BeautifulSoup, karat: int, grams: int):
    """
    Reads today/yesterday 1g rates from the goldpurity-rate data attributes,
    then scales to the requested gram size. Works for 18, 22, and 24 karat.
    """
    attr = f"data-goldrate{karat}kt"
    spans = soup.find_all("span", class_="goldpurity-rate")
    if len(spans) < 2:
        raise ValueError(f"Not enough goldpurity-rate spans to determine today/yesterday for {karat}Kt")

    today_1g = float(spans[0][attr])
    yesterday_1g = float(spans[1][attr])
    today = today_1g * grams
    yesterday = yesterday_1g * grams
    delta = today - yesterday
    delta_pct = (delta / yesterday * 100) if yesterday else 0
    sign = "+" if delta >= 0 else ""

    return {
        "karat_label": f"{karat} Kt Gold Rate",
        "grammage": f"{grams} G",
        "today_raw": f"₹ {today:.0f} {sign}{delta:.0f} ({sign}{delta_pct:.2f}%)",
        "today_price": today,
        "yesterday_raw": f"₹ {yesterday:.0f}",
        "yesterday_price": yesterday,
    }


def parse_history_by_karat(soup: BeautifulSoup, karat: int):
    """
    Reads the Gold Rate History table using data-goldrate<karat>kt attributes on spans.
    Works for 18, 22, and 24 karat. Returns [{"date": "DD-MM-YYYY", "rate": float}, ...]
    """
    attr = f"data-goldrate{karat}kt"
    history = []
    for table in soup.find_all("table"):
        header_text = " ".join(th.get_text(strip=True) for th in table.find_all("th"))
        if "Date" not in header_text or "Rate" not in header_text:
            continue
        for row in table.find_all("tr")[1:]:
            tds = row.find_all("td")
            if len(tds) < 2:
                continue
            date_str = tds[0].get_text(strip=True)
            span = tds[1].find("span", class_="goldpurity-rate")
            rate = float(span[attr]) if (span and span.get(attr)) else clean_number(tds[1].get_text(strip=True))
            history.append({"date": date_str, "rate": rate})
        break
    return history


def save_csv(rows, filename):
    if not rows:
        print(f"Nothing to save for {filename}")
        return
    keys = rows[0].keys()
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} rows -> {filename}")


def _arg(flag, default):
    try:
        return type(default)(sys.argv[sys.argv.index(flag) + 1])
    except (ValueError, IndexError):
        return default


def main():
    json_mode = "--json" in sys.argv
    karat = _arg("--karat", 22)
    grams = _arg("--grams", 1)

    html = fetch_page(URL)
    soup = BeautifulSoup(html, "lxml")

    current = parse_current_for_karat(soup, karat, grams)
    history = parse_history_by_karat(soup, karat)

    if json_mode:
        print(json.dumps({
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "current": [current],
            "history": history,
        }))
        return

    print(f"\n=== {karat} Kt Gold Rate ({grams}g) ===")
    print(current)

    print("\n=== Rate History (sample) ===")
    for r in history[:5]:
        print(r)
    print(f"... {len(history)} total rows")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    save_csv([current], f"tanishq_current_rates_{stamp}.csv")
    save_csv(history, f"tanishq_rate_history_{stamp}.csv")


if __name__ == "__main__":
    main()