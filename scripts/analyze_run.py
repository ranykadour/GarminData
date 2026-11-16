#!/usr/bin/env python3
"""Describe one run's course from its GPS track, without publishing any coordinates.

usage: python scripts/analyze_run.py ACTIVITY_ID OUT.json
Output: per-km splits, an elevation profile every 100 m, climbs, gradients, turns,
and route shape (loop / out-and-back / laps / point-to-point). No lat/lon is written.
"""
import json, math, sys, datetime as dt
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_garmin import login  # same auth as the daily sync
from garminconnect import Garmin


def hav(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def bearing(a, b):
    y = math.sin(math.radians(b[1] - a[1])) * math.cos(math.radians(b[0]))
    x = math.cos(math.radians(a[0])) * math.sin(math.radians(b[0])) - math.sin(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.cos(math.radians(b[1] - a[1]))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def parse_gpx(xml):
    root = ET.fromstring(xml)
    pts = []
    for tp in root.iter():
        if not tp.tag.endswith("trkpt"):
            continue
        p = {"lat": float(tp.get("lat")), "lon": float(tp.get("lon")), "ele": None, "t": None, "hr": None, "cad": None}
        for c in tp.iter():
            tag = c.tag.split("}")[-1]
            if tag == "ele": p["ele"] = float(c.text)
            elif tag == "time": p["t"] = dt.datetime.fromisoformat(c.text.replace("Z", "+00:00"))
            elif tag == "hr": p["hr"] = float(c.text)
            elif tag == "cad": p["cad"] = float(c.text)
        pts.append(p)
    return pts


def analyze(pts):
    d = [0.0]
    for i in range(1, len(pts)):
        d.append(d[-1] + hav((pts[i - 1]["lat"], pts[i - 1]["lon"]), (pts[i]["lat"], pts[i]["lon"])))
    total = d[-1]
    t0 = pts[0]["t"]
    secs = [(p["t"] - t0).total_seconds() if p["t"] else None for p in pts]
    # smooth elevation (GPS/baro noise) over ~5 points
    ele = [p["ele"] for p in pts]
    sm = []
    for i in range(len(ele)):
        w = [e for e in ele[max(0, i - 2): i + 3] if e is not None]
        sm.append(sum(w) / len(w) if w else None)

    def at(dist, arr):
        # value of arr at distance `dist` (linear interpolation)
        for i in range(1, len(d)):
            if d[i] >= dist:
                f = (dist - d[i - 1]) / ((d[i] - d[i - 1]) or 1)
                a, b = arr[i - 1], arr[i]
                return None if a is None or b is None else a + f * (b - a)
        return arr[-1]

    def seg(a, b, key):
        v = [pts[i][key] for i in range(len(pts)) if a <= d[i] < b and pts[i][key]]
        return round(sum(v) / len(v)) if v else None

    base = sm[0] or 0
    profile = []
    step = 100
    m = 0
    while m <= total:
        e = at(m, sm)
        profile.append({"m": m, "elev": None if e is None else round(e - base, 1)})
        m += step
    for i in range(1, len(profile)):
        a, b = profile[i - 1], profile[i]
        b_dist = min(b["m"], total)
        if a["elev"] is not None and b["elev"] is not None:
            b["gradePct"] = round((b["elev"] - a["elev"]) / (b_dist - a["m"] or 1) * 100, 1)
        ta, tb = at(a["m"], secs), at(b_dist, secs)
        if ta is not None and tb is not None and b_dist > a["m"]:
            b["paceSecPerKm"] = round((tb - ta) / ((b_dist - a["m"]) / 1000))
        b["hr"] = seg(a["m"], b_dist, "hr")

    splits = []
    k = 0
    while k * 1000 < total:
        a, b = k * 1000, min((k + 1) * 1000, total)
        ta, tb = at(a, secs), at(b, secs)
        ea, eb = at(a, sm), at(b, sm)
        gain = loss = 0.0
        prev = None
        for i in range(len(pts)):
            if a <= d[i] <= b and sm[i] is not None:
                if prev is not None:
                    diff = sm[i] - prev
                    gain += max(diff, 0); loss += max(-diff, 0)
                prev = sm[i]
        splits.append({"km": k + 1, "meters": round(b - a), "seconds": None if ta is None else round(tb - ta),
                       "hr": seg(a, b, "hr"), "cadence": seg(a, b, "cad"), "gain": round(gain, 1), "loss": round(loss, 1),
                       "netElev": None if ea is None else round(eb - ea, 1)})
        k += 1

    climbs, cur = [], None
    for p in profile[1:]:
        g = p.get("gradePct")
        if g is not None and g >= 2:
            cur = cur or {"fromM": p["m"] - step, "gain": 0.0}
            cur["toM"] = p["m"]; cur["gain"] += g * step / 100
        else:
            if cur and cur["toM"] - cur["fromM"] >= 100:
                cur["avgGradePct"] = round(cur["gain"] / (cur["toM"] - cur["fromM"]) * 100, 1); cur["gain"] = round(cur["gain"], 1); climbs.append(cur)
            cur = None
    if cur and cur["toM"] - cur["fromM"] >= 100:
        cur["avgGradePct"] = round(cur["gain"] / (cur["toM"] - cur["fromM"]) * 100, 1); cur["gain"] = round(cur["gain"], 1); climbs.append(cur)

    start = (pts[0]["lat"], pts[0]["lon"])
    from_start = [hav(start, (p["lat"], p["lon"])) for p in pts]
    returns, away = 0, False
    for f in from_start:
        if f > 120: away = True
        elif f < 30 and away: returns += 1; away = False
    # turns: heading change > 60 degrees across ~30 m
    turns, last_b, anchor = 0, None, 0
    for i in range(1, len(pts)):
        if d[i] - d[anchor] >= 30:
            b = bearing((pts[anchor]["lat"], pts[anchor]["lon"]), (pts[i]["lat"], pts[i]["lon"]))
            if last_b is not None and min(abs(b - last_b), 360 - abs(b - last_b)) > 60: turns += 1
            last_b, anchor = b, i
    end_gap, far = from_start[-1], max(from_start)
    # out-and-back: second half retraces the first (mirror points close together)
    mirror = []
    for frac in [i / 20 for i in range(1, 10)]:
        i1 = min(range(len(d)), key=lambda i: abs(d[i] - frac * total))
        i2 = min(range(len(d)), key=lambda i: abs(d[i] - (1 - frac) * total))
        mirror.append(hav((pts[i1]["lat"], pts[i1]["lon"]), (pts[i2]["lat"], pts[i2]["lon"])))
    mirror_med = sorted(mirror)[len(mirror) // 2]
    if returns >= 2 and far < total / 3: shape = f"laps ({returns + (1 if end_gap < 30 else 0)} passes of the start)"
    elif end_gap > 200: shape = "point-to-point"
    elif mirror_med < 40: shape = "out-and-back"
    else: shape = "loop"

    hi = [p["elev"] for p in profile if p["elev"] is not None]
    grades = [p["gradePct"] for p in profile if p.get("gradePct") is not None]
    return {
        "distanceM": round(total), "points": len(pts),
        "shape": shape, "endToStartM": round(end_gap), "maxFromStartM": round(far), "sharpTurns": turns,
        "mirrorMedianM": round(mirror_med), "returnsToStart": returns,
        "elevRangeM": round(max(hi) - min(hi), 1) if hi else None, "maxGradePct": max(grades) if grades else None, "minGradePct": min(grades) if grades else None,
        "totalGainM": round(sum(s["gain"] for s in splits), 1), "totalLossM": round(sum(s["loss"] for s in splits), 1),
        "splits": splits, "climbs": climbs, "profile100m": profile,
    }


def main():
    aid, out = sys.argv[1], Path(sys.argv[2])
    g = login()
    gpx = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.GPX)
    pts = parse_gpx(gpx)
    if len(pts) < 10:
        sys.exit(f"activity {aid} has no usable GPS track ({len(pts)} points)")
    res = {"activityId": aid, "course": analyze(pts)}
    try:
        laps = (g.get_activity_splits(aid) or {}).get("lapDTOs") or []
        keep = ("distance", "duration", "movingDuration", "elevationGain", "elevationLoss", "averageHR", "maxHR", "averageSpeed", "averageRunCadence", "maxElevation", "minElevation")
        res["garminLaps"] = [{k: l.get(k) for k in keep} for l in laps]
    except Exception as e:
        print(f"warn: laps failed: {e}", file=sys.stderr)
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(res, indent=1, default=str)
    assert '"lat' not in text and '"lon' not in text, "refusing to write coordinates"
    out.write_text(text)
    print(f"wrote {out}: {res['course']['shape']}, {res['course']['distanceM']} m, +{res['course']['totalGainM']} m", file=sys.stderr)


if __name__ == "__main__":
    main()
