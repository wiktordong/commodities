# Daily Asia Commodities Morning Brief

Auto-generated, GS-style sales-desk morning brief covering Energy, Environmental
Commodities, and Metals for the Asia open. Runs on a GitHub Actions cron,
publishes to GitHub Pages, and emails an HTML copy.

## Schedule

`05:30 UTC` Mon–Fri = **07:30 CEST** (summer) / 06:30 CET (winter). Edit the
cron in `.github/workflows/daily-brief.yml` to shift.

## Setup

1. **Enable GitHub Pages** for this repo: Settings → Pages → Source = "GitHub
   Actions".
2. **Add SMTP secrets** under Settings → Secrets and variables → Actions:
   - `EMAIL_SMTP_HOST` (e.g. `smtp.gmail.com`)
   - `EMAIL_SMTP_PORT` (e.g. `587`)
   - `EMAIL_USER` — SMTP login / From address
   - `EMAIL_PASS` — SMTP password or app password
   - `EMAIL_TO` — comma-separated recipients
3. Trigger a manual run: Actions → "Daily Asia Commodities Brief" → Run workflow.

## Local development

```bash
pip install -r requirements.txt
cd scripts
python generate_brief.py        # writes public/index.html + public/briefs/<date>.html
python send_email.py            # also emails (requires env vars)
```

Open `public/index.html` in a browser.

## Data sources

Free public APIs only — Yahoo Finance via `yfinance`. Tickers covered include
Brent (`BZ=F`), WTI (`CL=F`), nat gas (`NG=F`), gasoil (`QS=F`), copper
(`HG=F`), gold/silver/platinum, US10Y, DXY, S&P, VIX, USDCNH, EURUSD, USDJPY.

Items not available on free feeds (Dubai, LME 3M, ETS, iron ore CFR, Singapore
cracks, JKM/TTF, etc.) render as bracketed placeholders like `[EU_CARBON_PRICE]`
so the layout stays intact. Wire in a paid feed by extending `scripts/fetch_data.py`.

## Files

- `templates/brief.html.j2` — Jinja2 template; edit narrative and structure here.
- `scripts/fetch_data.py` — pulls market data, returns placeholder dict.
- `scripts/generate_brief.py` — renders template, writes site + archive.
- `scripts/send_email.py` — renders + emails via SMTP.
- `.github/workflows/daily-brief.yml` — cron + Pages deploy.
- `public/` — generated site (committed each run for archive).
