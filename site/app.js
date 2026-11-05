(() => {
"use strict";
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const SVG = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, text) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

// ---------- formatting ----------
const fmtTime = (sec) => {
  if (sec == null || !isFinite(sec)) return "–";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
const fmtPace = (secPerKm) => (secPerKm ? fmtTime(secPerKm) + "/km" : "–");
const km = (m) => (m / 1000);
const parseDate = (str) => (str ? new Date(str.replace(" ", "T")) : null);
const fmtDate = (d, opts = { month: "short", day: "numeric" }) => d ? d.toLocaleDateString(undefined, opts) : "–";
const fmtDateY = (d) => fmtDate(d, { month: "short", day: "numeric", year: "numeric" });

// ---------- tooltip ----------
const tip = $("#tip");
function showTip(evt, value, label) {
  tip.replaceChildren(el("div", { class: "tv" }, value), el("div", { class: "tl" }, label));
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = evt.clientX + 14, y = evt.clientY - r.height - 10;
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
  if (y < 8) y = evt.clientY + 16;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => (tip.hidden = true);

// ---------- generic chart scaffolding ----------
function frame(container, { h = 240, padL = 44, padR = 12, padT = 12, padB = 26 } = {}) {
  const w = Math.max(container.clientWidth, 280);
  const svg = s("svg", { viewBox: `0 0 ${w} ${h}`, role: "img" });
  container.replaceChildren(svg);
  return { svg, w, h, x0: padL, x1: w - padR, y0: padT, y1: h - padB };
}
function niceTicks(min, max, n = 4) {
  const span = max - min || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((st) => span / st <= n) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

// Time-series: points [{t:Date, y:Number, label}]; opts.invert puts low values on top (pace/time).
function timeChart(container, pts, opts = {}) {
  if (!pts.length) { container.replaceChildren(el("div", { class: "empty" }, opts.empty || "No data yet.")); return; }
  const F = frame(container, { h: opts.h || 240, padL: 50 });
  const { svg, x0, x1, y0, y1 } = F;
  const ts = pts.map((p) => +p.t);
  let tmin = Math.min(...ts), tmax = Math.max(...ts);
  if (tmin === tmax) { tmin -= 864e5 * 3; tmax += 864e5 * 3; }
  const ys = pts.map((p) => p.y).concat(opts.goal != null ? [opts.goal] : []);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  const padY = (ymax - ymin) * 0.12 || ymax * 0.05 || 1;
  ymin -= padY; ymax += padY;
  const X = (t) => x0 + ((t - tmin) / (tmax - tmin)) * (x1 - x0);
  const Y = (v) => opts.invert ? y0 + ((v - ymin) / (ymax - ymin)) * (y1 - y0) : y1 - ((v - ymin) / (ymax - ymin)) * (y1 - y0);

  const ax = s("g", { class: "axis" });
  const ticks = opts.yTicks ? opts.yTicks(ymin, ymax) : niceTicks(ymin, ymax);
  for (const v of ticks) {
    ax.append(s("line", { class: "gridline", x1: x0, x2: x1, y1: Y(v), y2: Y(v) }));
    ax.append(s("text", { x: x0 - 8, y: Y(v) + 4, "text-anchor": "end" }, opts.fmtY ? opts.fmtY(v) : v));
  }
  const nX = Math.min(6, Math.max(2, Math.floor((x1 - x0) / 110)));
  for (let i = 0; i <= nX; i++) {
    const t = tmin + ((tmax - tmin) * i) / nX;
    ax.append(s("text", { x: X(t), y: y1 + 18, "text-anchor": i === 0 ? "start" : i === nX ? "end" : "middle" }, fmtDate(new Date(t), tmax - tmin < 120 * 864e5 ? { month: "short", day: "numeric" } : { month: "short", year: "2-digit" })));
  }
  svg.append(ax);

  if (opts.goal != null) {
    svg.append(s("line", { class: "goal-line", x1: x0, x2: x1, y1: Y(opts.goal), y2: Y(opts.goal) }));
    svg.append(s("text", { class: "goal-label", x: x1, y: Y(opts.goal) - 6, "text-anchor": "end" }, opts.goalLabel || "Goal"));
  }

  const sorted = [...pts].sort((a, b) => a.t - b.t);
  if (opts.line !== false && sorted.length > 1) {
    const d = sorted.map((p, i) => `${i ? "L" : "M"}${X(+p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    if (opts.area) svg.append(s("path", { class: "series-area", d: `${d}L${X(+sorted.at(-1).t)},${y1}L${X(+sorted[0].t)},${y1}Z` }));
    svg.append(s("path", { class: "series-line", d }));
  }
  const showDots = opts.dots ?? true;
  const dots = s("g");
  for (const p of sorted) {
    if (showDots) dots.append(s("circle", { class: "pt" + (opts.ptClass ? " " + opts.ptClass(p) : ""), cx: X(+p.t), cy: Y(p.y), r: p.highlight ? 6 : 4 }));
    if (p.annotate) svg.append(s("text", { class: "lbl", x: X(+p.t), y: Y(p.y) - 12, "text-anchor": X(+p.t) > x1 - 60 ? "end" : "middle" }, p.annotate));
  }
  svg.append(dots);

  // Crosshair: snap to nearest point by x.
  const hx = s("line", { class: "hover-x", y1: y0, y2: y1, visibility: "hidden" });
  const hit = s("rect", { class: "hit", x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  svg.append(hx, hit);
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * F.w;
    let best = sorted[0], bd = Infinity;
    for (const p of sorted) { const d = Math.abs(X(+p.t) - mx); if (d < bd) { bd = d; best = p; } }
    hx.setAttribute("x1", X(+best.t)); hx.setAttribute("x2", X(+best.t)); hx.setAttribute("visibility", "visible");
    showTip(e, opts.fmtY ? opts.fmtY(best.y) : best.y, best.label);
  });
  hit.addEventListener("pointerleave", () => { hx.setAttribute("visibility", "hidden"); hideTip(); });
}

// Bars: [{label, y, tip, cur}]
function barChart(container, bars, opts = {}) {
  if (!bars.length) { container.replaceChildren(el("div", { class: "empty" }, "No data yet.")); return; }
  const F = frame(container, { h: opts.h || 240, padL: 36 });
  const { svg, x0, x1, y0, y1 } = F;
  const ymax = Math.max(...bars.map((b) => b.y), 1) * 1.1;
  const Y = (v) => y1 - (v / ymax) * (y1 - y0);
  const ax = s("g", { class: "axis" });
  for (const v of niceTicks(0, ymax)) {
    ax.append(s("line", { class: "gridline", x1: x0, x2: x1, y1: Y(v), y2: Y(v) }));
    ax.append(s("text", { x: x0 - 8, y: Y(v) + 4, "text-anchor": "end" }, v));
  }
  svg.append(ax);
  const slot = (x1 - x0) / bars.length, bw = Math.max(2, slot - 2);
  const every = Math.ceil(bars.length / Math.max(2, Math.floor((x1 - x0) / 70)));
  bars.forEach((b, i) => {
    const x = x0 + i * slot + 1, top = Y(b.y), hgt = y1 - top;
    const r = Math.min(4, bw / 2, hgt);
    // rounded top only, anchored to baseline
    const d = hgt <= 0 ? "" : `M${x},${y1}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${y1}Z`;
    if (d) svg.append(s("path", { class: "bar" + (b.cur ? " cur" : ""), d }));
    if (i % every === 0) svg.append(s("text", { class: "xl", x: x + bw / 2, y: y1 + 18, "text-anchor": "middle" }, b.label));
    const h = s("rect", { class: "hit", x: x0 + i * slot, y: y0, width: slot, height: y1 - y0 });
    h.addEventListener("pointermove", (e) => showTip(e, b.tip, b.label));
    h.addEventListener("pointerleave", hideTip);
    svg.append(h);
  });
  svg.append(s("line", { class: "baseline", x1: x0, x2: x1, y1: y1, y2: y1 }));
}

// ---------- data shaping ----------
function best3kEfforts(runs, goal) {
  const D = goal.distanceMeters;
  const out = [];
  for (const r of runs) {
    const split = r.splits && (r.splits[String(D)] ?? r.splits[D]);
    let sec = null, how = null;
    if (split) { sec = split; how = "fastest 3K split"; }
    else if (r.distance >= D * 0.985 && r.distance <= D * 1.1 && r.duration) { sec = r.duration * (D / r.distance); how = "whole run, scaled to 3K"; }
    if (sec && sec < 60 * 30) out.push({ t: r.date, y: sec, label: `${fmtDateY(r.date)} · ${r.name || "Run"} (${how})`, run: r, how });
  }
  return out;
}

function weekStart(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

function kvRows(container, rows) {
  if (!rows.length) { container.replaceChildren(el("div", { class: "empty" }, "Nothing reported by Garmin.")); return; }
  container.replaceChildren(...rows.map(([l, r, sm]) => {
    const row = el("div", { class: "row" });
    const rv = el("span", { class: "r num" }, r);
    if (sm) rv.append(el("small", {}, sm));
    row.append(el("span", { class: "l" }, l), rv);
    return row;
  }));
}

// ---------- render ----------
let DATA, CONFIG;
function render() {
  const goal = CONFIG.goal;
  const acts = (DATA.activities || []).map((a) => ({ ...a, date: parseDate(a.start) })).filter((a) => a.date);
  const runs = acts.filter((a) => a.isRun && a.distance > 0).sort((a, b) => b.date - a.date);
  const now = new Date();

  if (DATA.name) $("#who").textContent = DATA.name;
  if (DATA.generatedAt) $("#synced").textContent = "Synced " + new Date(DATA.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  // --- hero
  const efforts = best3kEfforts(runs, goal);
  let best = efforts.reduce((m, e) => (!m || e.y < m.y ? e : m), null);
  const man = CONFIG.manualBest3k;
  if (man && man.seconds && (!best || man.seconds < best.y)) {
    best = { y: man.seconds, t: parseDate(man.date) || now, how: man.note || "entered manually", manual: true };
    efforts.push({ t: best.t, y: best.y, label: `${fmtDateY(best.t)} · ${best.how}` });
  }
  const hit = best && best.y <= goal.targetSeconds;
  const firstHit = efforts.filter((e) => e.y <= goal.targetSeconds).sort((a, b) => a.t - b.t)[0];
  const diff = best ? goal.targetSeconds - best.y : null;

  const hero = $("#hero");
  hero.replaceChildren();
  const left = el("div");
  left.append(el("div", { class: "eyebrow" }, "Main goal"));
  const h1 = el("h1"); h1.append(document.createTextNode(goal.label + " "), el("span", { class: "goal num" }, fmtTime(goal.targetSeconds)));
  left.append(h1);
  left.append(el("p", { class: "lede" }, hit
    ? `Done. You ran ${goal.label} in ${fmtTime(best.y)}${firstHit ? ` and first broke ${fmtTime(goal.targetSeconds)} on ${fmtDateY(firstHit.t)}` : ""}.`
    : best ? `Best so far is ${fmtTime(best.y)}. That's ${fmtTime(-diff)} to go.` : `No 3K efforts found yet.`));
  left.append(el("div", { class: "badge" + (hit ? "" : " pending") }, hit ? "✓ Goal achieved" : "In progress"));
  const right = el("div", { class: "hero-stats" });
  const hs = (k, v, sub, big) => { const d = el("div", { class: "hs" + (big ? " big" : "") }); d.append(el("div", { class: "k" }, k), el("div", { class: "v num" }, v)); if (sub) d.append(el("div", { class: "s" }, sub)); return d; };
  right.append(hs(`Best ${goal.label}`, best ? fmtTime(best.y) : "–", best ? `${fmtDateY(best.t)} · ${best.how}` : "", true));
  right.append(hs("Margin vs goal", diff == null ? "–" : (diff >= 0 ? "−" : "+") + fmtTime(Math.abs(diff)), diff >= 0 ? "under target" : "over target"));
  right.append(hs("Goal pace", fmtPace(goal.targetSeconds / (goal.distanceMeters / 1000)), best ? `yours: ${fmtPace(best.y / (goal.distanceMeters / 1000))}` : ""));
  hero.append(left, right);

  // --- tiles
  const yr = runs.filter((r) => r.date.getFullYear() === now.getFullYear());
  const d84 = new Date(now - 84 * 864e5);
  const last12w = runs.filter((r) => r.date >= d84);
  const mm = Array.isArray(DATA.maxMetrics) ? DATA.maxMetrics[0] : DATA.maxMetrics;
  const vo2 = mm?.generic?.vo2MaxPreciseValue ?? mm?.generic?.vo2MaxValue ?? runs.find((r) => r.vo2max)?.vo2max;
  const rhrs = (DATA.daily || []).filter((d) => d.restingHR);
  const rhr = rhrs.at(-1)?.restingHR;
  const tiles = [
    [`${now.getFullYear()} distance`, km(yr.reduce((a, r) => a + r.distance, 0)).toFixed(0), "km", `${yr.length} runs`],
    ["Weekly average", km(last12w.reduce((a, r) => a + r.distance, 0) / 12).toFixed(1), "km", "last 12 weeks"],
    ["Longest run", runs.length ? km(Math.max(...runs.map((r) => r.distance))).toFixed(1) : "–", "km", "all synced"],
    ["VO₂ max", vo2 ? Math.round(vo2) : "–", "", "Garmin estimate"],
    ["Resting HR", rhr ?? "–", "bpm", rhrs.length ? `30-day low ${Math.min(...rhrs.map((d) => d.restingHR))}` : ""],
  ];
  $("#tiles").replaceChildren(...tiles.map(([k, v, u, sub]) => {
    const t = el("div", { class: "tile" });
    const vv = el("div", { class: "v num" }, String(v)); if (u) vv.append(el("small", {}, u));
    t.append(el("div", { class: "k" }, k), vv, el("div", { class: "s" }, sub));
    return t;
  }));

  // --- charts
  const draw = () => {
    for (const e of efforts) { e.highlight = best && e.y === best.y; e.annotate = e.highlight ? fmtTime(e.y) : null; }
    timeChart($("#c3k"), efforts, { invert: true, goal: goal.targetSeconds, goalLabel: `Goal ${fmtTime(goal.targetSeconds)}`, fmtY: fmtTime,
      yTicks: (a, b) => { const st = [15, 30, 60, 120, 300].find((x) => (b - a) / x <= 5) || 600; const o = []; for (let v = Math.ceil(a / st) * st; v <= b; v += st) o.push(v); return o; }, ptClass: (p) => (p.y <= goal.targetSeconds ? "under" : ""),
      empty: "No runs of about 3K found. Add a manual result in config.json." });

    const weeks = [];
    const ws = weekStart(now);
    for (let i = 25; i >= 0; i--) { const w = new Date(ws); w.setDate(w.getDate() - i * 7); weeks.push({ start: w, m: 0, n: 0 }); }
    for (const r of runs) { const w = weeks.find((x) => +x.start === +weekStart(r.date)); if (w) { w.m += r.distance; w.n++; } }
    barChart($("#cweekly"), weeks.map((w, i) => ({ label: fmtDate(w.start), y: +km(w.m).toFixed(1), cur: i === weeks.length - 1,
      tip: `${km(w.m).toFixed(1)} km · ${w.n} run${w.n === 1 ? "" : "s"}` })));

    const d180 = new Date(now - 180 * 864e5);
    const pacePts = runs.filter((r) => r.date >= d180 && r.distance >= 1000 && (r.movingDuration || r.duration))
      .map((r) => { const p = (r.movingDuration || r.duration) / km(r.distance); return { t: r.date, y: p, label: `${fmtDateY(r.date)} · ${km(r.distance).toFixed(1)} km` }; })
      .filter((p) => p.y > 150 && p.y < 600);
    timeChart($("#cpace"), pacePts, { invert: true, line: false, fmtY: (v) => fmtTime(v), goal: goal.targetSeconds / (goal.distanceMeters / 1000), goalLabel: "3K goal pace" });

    timeChart($("#crhr"), rhrs.map((d) => ({ t: parseDate(d.date), y: d.restingHR, label: fmtDateY(parseDate(d.date)) })), { h: 180, area: true, dots: false, fmtY: (v) => Math.round(v) });
  };
  draw();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 120); });

  // --- predictions
  const rp = Array.isArray(DATA.racePredictions) ? DATA.racePredictions[0] : DATA.racePredictions;
  const predRows = [];
  if (rp) for (const [k, l] of [["time5K", "5K"], ["time10K", "10K"], ["timeHalfMarathon", "Half marathon"], ["timeMarathon", "Marathon"]])
    if (rp[k]) predRows.push([l, fmtTime(rp[k]), fmtPace(rp[k] / { "5K": 5, "10K": 10, "Half marathon": 21.0975, Marathon: 42.195 }[l])]);
  if (best) { // Riegel projection from the 3K best, for comparison
    predRows.push(["5K (from your 3K, Riegel)", fmtTime(best.y * (5000 / goal.distanceMeters) ** 1.06), ""]);
  }
  kvRows($("#preds"), predRows);

  // --- PRs
  const prRows = (DATA.personalRecords || []).filter((p) => p.label).sort((a, b) => a.typeId - b.typeId).map((p) =>
    p.typeId === 7 ? [p.label, km(p.value).toFixed(2) + " km", fmtDateY(parseDate(p.date))] : [p.label, fmtTime(p.value), fmtDateY(parseDate(p.date))]);
  kvRows($("#prs"), prRows);

  // --- table
  const tb = $("#runs tbody");
  tb.replaceChildren(...runs.slice(0, 15).map((r) => {
    const tr = el("tr");
    const t = r.movingDuration || r.duration;
    tr.append(el("td", {}, fmtDate(r.date)), el("td", { class: "name" }, r.name || "Run"), el("td", { class: "r" }, km(r.distance).toFixed(2) + " km"),
      el("td", { class: "r" }, fmtTime(t)), el("td", { class: "r" }, fmtPace(t / km(r.distance))), el("td", { class: "r" }, r.avgHR ? Math.round(r.avgHR) : "–"));
    return tr;
  }));
  if (!runs.length) { const tr = el("tr"); tr.append(el("td", { colspan: 6, class: "empty" }, "No runs synced yet.")); tb.replaceChildren(tr); }
}

Promise.all([
  fetch("config.json").then((r) => r.json()),
  fetch("data/garmin.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
]).then(([cfg, data]) => {
  CONFIG = cfg;
  if (!data) { $("#app").hidden = true; $("#setup").hidden = false; return; }
  DATA = data;
  render();
});
})();
