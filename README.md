# GarminData: running dashboard

A static site showing my Garmin running data, built around the main goal: **3K in 16:15** (done ✓).

**What it shows:** goal hero (best 3K, margin, pace) · season tiles (distance, weekly average, longest run, VO₂ max, resting HR) · every 3K effort over time against the 16:15 line · weekly distance · run pace · Garmin race predictions · personal records · resting HR · recent runs.

## How it works

```
GitHub Action (daily) ── scripts/fetch_garmin.py ──> private `data` branch ──> dashboard page on claude.ai
```

The data snapshot lives only on the `data` branch of this private repo. To update the dashboard page, ask Claude to republish it from the latest snapshot.

## Setup

1. **Get a Garmin token** on your own computer (this handles MFA once):
   ```bash
   pip install -r requirements.txt
   GARMIN_EMAIL=you@example.com GARMIN_PASSWORD='...' python scripts/fetch_garmin.py --save-tokens
   ```
   It prints a long token string.
2. **Add repo secrets** (Settings → Secrets and variables → Actions): `GARMIN_TOKENS` = that string.
   (Or set `GARMIN_EMAIL` + `GARMIN_PASSWORD` instead, if your account has no MFA.)
3. **Turn on Pages:** Settings → Pages → Source: **GitHub Actions**.
4. Push to `main`, or run the **Refresh Garmin data & deploy site** workflow by hand. After that it refreshes every day.

### Preview locally
```bash
python scripts/fetch_garmin.py        # writes site/data/garmin.json
python -m http.server -d site 8000    # open http://localhost:8000
```

## Config: `site/config.json`

- `goal`: distance and target (`975` s = 16:15).
- `manualBest3k`: if your 3K PR was on a track, or Garmin didn't record it as a ~3K activity, put it here, e.g.
  `{ "seconds": 970, "date": "2026-09-14", "note": "Track race" }`.

How the best 3K is found: Garmin's `fastestSplit_3000` on an activity if it has one. Otherwise any run of 2.95 to 3.3 km, with its time scaled to 3,000 m. Otherwise your manual entry.

> Note: GitHub Pages sites are public, even from a private repo on most plans.
