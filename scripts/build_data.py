#!/usr/bin/env python3
"""Build the Deal Desk data file from the Dealflow Google Sheet.

Pulls the "Listings" tab as CSV, normalises it (currency -> USD, country,
industry group, seller representation, seller signals, listing date) and writes
`app/data/listings.js` (a JS file so the app also works when opened via file://).

Usage:  python3 scripts/build_data.py            # fetch live from the sheet
        python3 scripts/build_data.py local.csv  # use a downloaded CSV
Only the Python standard library is used.
"""
import csv
import io
import json
import re
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

SHEET_ID = "10CbVxXhOz--HNdlIfbk-w_33IKoNE3lNj-JnVhG6aaQ"
LISTINGS_GID = "960043005"
OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "listings.js"

# Approximate FX to USD — update as needed.
FX_TO_USD = {"USD": 1.0, "MYR": 0.22, "GBP": 1.27, "EUR": 1.08, "CAD": 0.73, "AUD": 0.65, "SGD": 0.75}

# Who posted the listing, inferred from the source.
OWNER_SOURCES = {"Facebook Marketplace", "Mudah.my", "Carousell", "Threads", "Instagram", "Flippa"}
BROKER_SOURCES = {"Empire Flippers", "FE International", "BusinessBrokers.com.my"}

US_STATES = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY "
                "NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split())
US_STATE_NAMES = {"alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
                  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
                  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
                  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
                  "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
                  "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
                  "virginia", "washington", "west virginia", "wisconsin", "wyoming"}
MY_PLACES = {"malaysia", "my", "selangor", "kuala lumpur", "kl", "penang", "johor", "perak", "sabah", "sarawak",
             "melaka", "malacca", "kedah", "kelantan", "terengganu", "pahang", "negeri sembilan", "perlis",
             "putrajaya", "labuan", "cheras", "puchong", "klang", "kajang", "petaling jaya", "subang", "ampang",
             "shah alam", "kepong", "oug", "kota kemuning", "nilai", "semenyih"}
COUNTRY_ALIASES = {"us": "United States", "usa": "United States", "united states": "United States",
                   "uk": "United Kingdom", "united kingdom": "United Kingdom", "uae": "UAE",
                   "united arab emirates": "UAE", "online": "Online"}

INDUSTRY_RULES = [  # first match wins; matched against Genre + Company
    ("F&B", r"restaurant|cafe|coffee|kopitiam|food|f&b|bakery|pizza|bar\b|juice|smoothie|kitchen|noodle|milk tea|eatery|catering|kedai makan|nasi"),
    ("Healthcare", r"health|medical|dental|clinic|chiro|pharma|audiolog|hospital|therapy|vet|wellness|hormone"),
    ("E-commerce", r"e-?comm|amazon|fba|shopify|dtc|online store|diecast"),
    ("SaaS & Digital", r"saas|software|app\b|ios|android|content|affiliate|newsletter|ai\b|platform|marketplace|digital|youtube|website"),
    ("Beauty & Personal", r"beauty|salon|spa|hair|barber|nail|cosmetic|bridal"),
    ("Education", r"educat|school|tuition|kindergarten|tadika|learning|course|studio|childcare"),
    ("Home & Field Services", r"clean|landscap|lawn|pest|plumb|hvac|roof|restoration|home service|staging|pressure|dryer|pool|moving|security"),
    ("Construction & Trades", r"construct|contractor|electric|flooring|remodel|build"),
    ("Auto", r"auto|car wash|car service|mechanic|tyre|tire|vehicle"),
    ("Retail", r"retail|store|shop|minimart|grocery|convenience|lottery|vending|boutique|clothing|franchise"),
    ("Logistics & Distribution", r"distribut|logistic|courier|route|freight|transport|wholesale"),
    ("Manufacturing", r"manufactur|factory|fabricat|production"),
    ("Professional Services", r"staffing|agency|consult|account|financial|insurance|marketing|advertis|brokerage|property|real estate|travel|research"),
    ("Leisure & Hospitality", r"hotel|hospitality|tour|rental|gaming|entertainment|event|fitness|gym|bike"),
]

SIGNALS = {
    "Retiring": r"retir",
    "Relocating": r"relocat|moving|migrat|move overseas",
    "Motivated": r"urgent|quick sale|priced to sell|must sell|gift|negotiable|let go|below",
    "Seller financing": r"seller financ|financing (?:available|possible)",
    "Absentee": r"absentee|semi-absentee|passive|manager in place|managers in place",
    "Health": r"health reasons|illness|medical reasons",
}

MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}


def num(s):
    s = (s or "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def country_of(loc):
    parts = [p.strip() for p in (loc or "").split(",") if p.strip()]
    if not parts:
        return "Unknown"
    last = re.sub(r"\(.*?\)", "", parts[-1]).strip()
    low = last.lower()
    if low in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[low]
    if last.upper() in US_STATES or low in US_STATE_NAMES:
        return "United States"
    if any(p.lower() in MY_PLACES for p in parts) or low in MY_PLACES:
        return "Malaysia"
    if low.startswith("not disclosed") or low.startswith("remote"):
        return "Unknown"
    return last


def industry_of(genre, co):
    text = f"{genre} {co}".lower()
    for name, pat in INDUSTRY_RULES:
        if re.search(pat, text):
            return name
    return "Other"


def listed_date(blurb, scan):
    m = re.search(r"(?:Listed|Posted|post)\s+(\d{1,2})\s+([A-Za-z]{3})", blurb or "")
    if m and m.group(2).lower() in MONTHS:
        try:
            return date(scan.year, MONTHS[m.group(2).lower()], int(m.group(1))).isoformat()
        except ValueError:
            pass
    return scan.isoformat()


def main():
    if len(sys.argv) > 1:
        text = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={LISTINGS_GID}"
        text = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")

    rows = list(csv.DictReader(io.StringIO(text)))
    out, seen = [], {}
    for i, r in enumerate(rows):
        cur = (r.get("Cur") or "USD").strip() or "USD"
        fx = FX_TO_USD.get(cur, 1.0)
        ask, rev, profit = num(r.get("Ask")), num(r.get("Rev")), num(r.get("Profit"))
        scan = datetime.strptime(r["Date"], "%Y-%m-%d").date()
        blurb = r.get("Blurb", "")
        src = r.get("Source", "").strip()
        rep = "owner" if src in OWNER_SOURCES else "broker" if src in BROKER_SOURCES else "unknown"
        if rep == "unknown" and re.search(r"\bbroker\b|\badvisor\b", blurb, re.I):
            rep = "broker"
        if rep == "unknown" and re.search(r"\bfsbo\b|by owner|owner-listed", blurb, re.I):
            rep = "owner"
        signals = [k for k, p in SIGNALS.items() if re.search(p, blurb, re.I)]
        country = country_of(r.get("Loc"))
        if src in ("Flippa", "Empire Flippers", "FE International") or "online" in (r.get("Loc") or "").lower():
            country = "Online" if country in ("Unknown", "Online") or src in ("Empire Flippers",) else country
        ask_usd = round(ask * fx) if ask else None
        profit_usd = round(profit * fx) if profit else None
        mult = num(r.get("Mult"))
        if mult is None and ask and profit and profit > 0:
            mult = round(ask / profit, 2)
        # duplicate key: same rounded ask + same first location token
        city = (r.get("Loc") or "").split(",")[0].strip().lower()
        dkey = (ask_usd, city) if ask_usd else None
        dup_of = seen.get(dkey) if dkey else None
        if dkey and dup_of is None:
            seen[dkey] = i
        out.append({
            "id": i,
            "scan": r["Date"],
            "listed": listed_date(blurb, scan),
            "source": src,
            "name": r.get("Co", "").strip(),
            "genre": r.get("Genre", "").strip(),
            "industry": industry_of(r.get("Genre", ""), r.get("Co", "")),
            "loc": (r.get("Loc") or "").strip(),
            "country": country,
            "cur": cur,
            "ask": ask, "askUsd": ask_usd,
            "rev": rev, "revUsd": round(rev * fx) if rev else None,
            "profit": profit, "profitUsd": profit_usd,
            "mult": mult,
            "est": (r.get("Est") or "").strip() or None,
            "link": r.get("Link", "").strip(),
            "blurb": blurb.strip(),
            "rep": rep,
            "signals": signals,
            "dupOf": dup_of,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    meta = {"builtAt": datetime.now().isoformat(timespec="minutes"), "count": len(out),
            "lastScan": max(x["scan"] for x in out), "fx": FX_TO_USD}
    OUT.write_text("// Generated by scripts/build_data.py — do not edit by hand.\n"
                   f"window.DEALFLOW_META = {json.dumps(meta)};\n"
                   f"window.DEALFLOW_LISTINGS = {json.dumps(out, ensure_ascii=False)};\n", encoding="utf-8")
    from collections import Counter
    print(f"Wrote {len(out)} listings -> {OUT}")
    print("rep:", Counter(x["rep"] for x in out))
    print("country:", Counter(x["country"] for x in out).most_common(12))
    print("industry:", Counter(x["industry"] for x in out).most_common())


if __name__ == "__main__":
    main()

