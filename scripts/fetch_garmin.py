#!/usr/bin/env python3
"""Pull Garmin Connect data into site/data/garmin.json for the dashboard.

Auth (pick one, via env vars):
  GARMIN_TOKENS            base64 token string from `python scripts/fetch_garmin.py --save-tokens`
  GARMIN_EMAIL + GARMIN_PASSWORD
"""
import datetime as dt
import json
import os
import sys
from pathlib import Path

from garminconnect import Garmin

OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "garmin.json"
RUN_TYPES = {"running", "track_running", "treadmill_running", "trail_running", "indoor_running", "street_running", "virtual_run"}
PR_LABELS = {1: "1K", 2: "1 mile", 3: "5K", 4: "10K", 5: "Half marathon", 6: "Marathon", 7: "Longest run"}


def log(msg):
    print(msg, file=sys.stderr)


def login():
    tokens = os.environ.get("GARMIN_TOKENS")
    if tokens:
        g = Garmin()
        g.login(tokens)
        return g
    email, pw = os.environ.get("GARMIN_EMAIL"), os.environ.get("GARMIN_PASSWORD")
    if not (email and pw):
        sys.exit("Set GARMIN_TOKENS, or GARMIN_EMAIL and GARMIN_PASSWORD.")
    g = Garmin(email, pw)
    g.login()
    return g


def safe(name, fn, *a):
    try:
        return fn(*a)
    except Exception as e:  # one failing endpoint shouldn't kill the whole refresh
        log(f"warn: {name} failed: {e}")
        return None


def slim(a):
    t = (a.get("activityType") or {}).get("typeKey", "")
    keep = {
        "id": a.get("activityId"),
        "name": a.get("activityName"),
        "type": t,
        "isRun": t in RUN_TYPES,
        "start": a.get("startTimeLocal"),
        "distance": a.get("distance"),
        "duration": a.get("duration"),
        "movingDuration": a.get("movingDuration"),
        "avgHR": a.get("averageHR"),
        "maxHR": a.get("maxHR"),
        "elevationGain": a.get("elevationGain"),
        "calories": a.get("calories"),
        "vo2max": a.get("vO2MaxValue"),
        "trainingEffect": a.get("aerobicTrainingEffect"),
        "cadence": a.get("averageRunningCadenceInStepsPerMinute"),
    }
    # Garmin's "fastest split" fields, e.g. fastestSplit_1000 / _1609 / _3000 / _5000 (seconds)
    keep["splits"] = {k.split("_", 1)[1]: v for k, v in a.items() if k.startswith("fastestSplit_") and v}
    return keep


def main():
    if "--save-tokens" in sys.argv:
        g = login()
        print(g.garth.dumps())
        return

    g = login()
    today = dt.date.today()
    acts, start = [], 0
    while start < 2000:
        page = safe("activities", g.get_activities, start, 100) or []
        acts += page
        if len(page) < 100:
            break
        start += 100
    log(f"fetched {len(acts)} activities")

    prs = []
    for p in safe("personal records", g.get_personal_record) or []:
        prs.append({
            "typeId": p.get("typeId"),
            "label": PR_LABELS.get(p.get("typeId")),
            "value": p.get("value"),
            "date": p.get("actStartDateTimeInGMTFormatted") or p.get("prStartTimeGmtFormatted"),
            "activityId": p.get("activityId"),
        })

    daily = []
    for i in range(29, -1, -1):
        d = (today - dt.timedelta(days=i)).isoformat()
        s = safe(f"summary {d}", g.get_user_summary, d) or {}
        daily.append({"date": d, "restingHR": s.get("restingHeartRate"), "steps": s.get("totalSteps"),
                      "bodyBattery": s.get("bodyBatteryMostRecentValue"), "stress": s.get("averageStressLevel")})

    profile = safe("profile", g.get_full_name)
    preds = safe("race predictions", g.get_race_predictions)
    for p in (preds if isinstance(preds, list) else [preds]):
        if isinstance(p, dict):
            p.pop("userId", None)  # the published data never needs account IDs
    data = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "name": profile,
        "activities": [slim(a) for a in acts],
        "personalRecords": prs,
        "racePredictions": preds,
        "maxMetrics": safe("max metrics", g.get_max_metrics, today.isoformat()),
        "daily": daily,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, default=str))
    log(f"wrote {OUT}")


if __name__ == "__main__":
    main()
