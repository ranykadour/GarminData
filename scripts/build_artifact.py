#!/usr/bin/env python3
"""Bundle site/ + a garmin.json snapshot into one self-contained HTML page.

usage: python scripts/build_artifact.py path/to/garmin.json out.html
"""
import json, re, sys
from pathlib import Path

site = Path(__file__).resolve().parent.parent / "site"
data_path, out = Path(sys.argv[1]), Path(sys.argv[2])
html = (site / "index.html").read_text()
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="app.js"></script>', "")
head_links = "\n".join(re.findall(r'<link [^>]*fonts\.(?:googleapis|gstatic)[^>]*>', html))
safe = lambda s: s.replace("</", "<\\/")
page = f"""<title>Run Log</title>
<meta name="claude:viewport-fit-sides" content="cover">
{head_links}
<style>
{(site / "style.css").read_text()}
</style>
{body}
<script type="application/json" id="cfg-json">{safe((site / "config.json").read_text())}</script>
<script type="application/json" id="garmin-json">{safe(json.dumps(json.loads(data_path.read_text()), separators=(",", ":")))}</script>
<script>
{(site / "app.js").read_text()}
</script>
"""
out.write_text(page)
print(f"wrote {out} ({len(page)//1024} KB)")
