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
    svg.append(s("text", { class: "goal-label", x: x0 + 6, y: Y(opts.goal) - 6, "text-anchor": "start" }, opts.goalLabel || "Goal"));
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

const timeTicks = (a, b) => { const st = [15, 30, 60, 120, 300].find((x) => (b - a) / x <= 5) || 600; const o = []; for (let v = Math.ceil(a / st) * st; v <= b; v += st) o.push(v); return o; };

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

// ---------- maintenance checks & insights ----------
const DAY = 864e5;
const daysAgo = (d, now) => Math.floor((now - d) / DAY);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function renderMaintenance({ runs, acts, goal, best, efforts, now }) {
  const goalPace = goal.targetSeconds / (goal.distanceMeters / 1000);
  const within = (days) => runs.filter((r) => now - r.date <= days * DAY);
  const pace = (r) => (r.movingDuration || r.duration) / km(r.distance);
  const checks = [];

  // 1. A goal-pace 3K recently
  const fast = efforts.filter((e) => e.y <= goal.targetSeconds).sort((a, b) => b.t - a.t)[0];
  const fastAge = fast ? daysAgo(fast.t, now) : null;
  checks.push({ title: "Recent sub-16:15 3K", ok: fast && fastAge <= 30,
    val: fast ? (fastAge === 0 ? "Today" : `${plural(fastAge, "day")} ago`) : "None yet",
    why: fast && fastAge <= 30 ? `${fmtTime(fast.y)} on ${fmtDate(fast.t)}. Re-test about every 4 weeks.`
      : `Time to re-test. A 3K time trial by ${fmtDate(new Date(+now + 7 * DAY))} shows you still have it.` });

  // 2. Speed work in the last 14 days (any run of 1 km+ at goal pace or faster)
  const quick = within(14).filter((r) => r.distance >= 1000 && pace(r) <= goalPace * 1.02);
  checks.push({ title: "Speed in the last 2 weeks", ok: quick.length >= 1, val: plural(quick.length, "fast run"),
    why: quick.length ? `Runs at about ${fmtPace(goalPace)} or quicker keep the pace familiar.` : `Add one session at ${fmtPace(goalPace)}, e.g. 5 × 600 m with 90 s rest.` });

  // 3. Consistency: runs per week over the last 4 weeks
  const n28 = within(28).length, perWeek = n28 / 4;
  checks.push({ title: "Runs per week", ok: perWeek >= 2, val: perWeek.toFixed(1), why: perWeek >= 2 ? "Last 4 weeks. Two or more a week holds your fitness." : "Last 4 weeks. Aim for at least 2 runs a week." });

  // 4. Load: last 4 weeks vs the 8 weeks before (acute:chronic)
  const sum = (arr) => arr.reduce((a, r) => a + r.distance, 0);
  const recent = sum(within(28)) / 4;
  const base = sum(runs.filter((r) => now - r.date > 28 * DAY && now - r.date <= 84 * DAY)) / 8;
  const ratio = base ? recent / base : null;
  checks.push({ title: "Training load", ok: ratio != null && ratio >= 0.8 && ratio <= 1.3,
    val: ratio == null ? "–" : `${km(recent).toFixed(1)} km/wk`,
    why: ratio == null ? "Not enough history yet."
      : ratio < 0.8 ? `Down ${Math.round((1 - ratio) * 100)}% vs your previous 8 weeks (${km(base).toFixed(1)} km/wk). Build back gradually.`
      : ratio > 1.3 ? `Up ${Math.round((ratio - 1) * 100)}% vs your previous 8 weeks. Big jumps raise injury risk, so ease off a little.`
      : `Steady vs your previous 8 weeks (${km(base).toFixed(1)} km/wk).` });

  // 5. Recovery: resting HR last 7 days vs 30 days
  const rh = (DATA.daily || []).filter((d) => d.restingHR).map((d) => d.restingHR);
  if (rh.length >= 10) {
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const r7 = avg(rh.slice(-7)), r30 = avg(rh), diff = r7 - r30;
    checks.push({ title: "Recovery", ok: diff <= 2, val: `${r7.toFixed(0)} bpm`,
      why: diff <= 2 ? `7-day resting HR is in line with your 30-day average (${r30.toFixed(0)}).` : `7-day resting HR is ${diff.toFixed(1)} bpm above your 30-day average. Sleep, easy days.` });
  }

  COACH_CTX.checks = checks.map((c) => `${c.ok ? "OK" : "NEEDS WORK"} | ${c.title}: ${c.val}. ${c.why}`);
  $("#checks").replaceChildren(...checks.map((c) => {
    const d = el("div", { class: "check" });
    const top = el("div", { class: "top-row" });
    top.append(el("span", { class: "title" }, c.title), el("span", { class: "pill " + (c.ok ? "good" : "warn") }, c.ok ? "✓ On track" : "! Needs work"));
    d.append(top, el("div", { class: "val num" }, c.val), el("div", { class: "why" }, c.why));
    return d;
  }));

  // ----- insights
  const ins = [];
  const yearAgo = new Date(now - 365 * DAY);
  const yr = efforts.filter((e) => e.t >= yearAgo && e.y <= goal.targetSeconds * 1.35).sort((a, b) => a.t - b.t);
  if (yr.length >= 2 && best) {
    const first = yr[0];
    const gain = first.y - best.y;
    if (gain > 0) ins.push([`${fmtTime(gain)} faster over 3K since ${fmtDate(first.t, { month: "short", year: "numeric" })}`, `From ${fmtTime(first.y)} on ${fmtDateY(first.t)} to ${fmtTime(best.y)} on ${fmtDateY(best.t)}, across ${plural(yr.length, "3K effort")}.`]);
  }
  const byType = (pred) => efforts.filter((e) => e.run && pred(e.run.type)).reduce((m, e) => (!m || e.y < m.y ? e : m), null);
  const tm = byType((t) => t.includes("treadmill")), out = byType((t) => !t.includes("treadmill"));
  if (tm && out) {
    const both = tm.y <= goal.targetSeconds && out.y <= goal.targetSeconds;
    ins.push([both ? "You've broken 16:15 indoors and out" : "Treadmill vs outdoor",
      `Treadmill best ${fmtTime(tm.y)} (${fmtDate(tm.t)}), outdoor best ${fmtTime(out.y)} (${fmtDate(out.t)}). ${both ? "That's a solid result, not a treadmill fluke." : "Treadmills often read fast, so the outdoor time is the one to trust."}`]);
  }
  const rp = Array.isArray(DATA.racePredictions) ? DATA.racePredictions[0] : DATA.racePredictions;
  if (rp?.time5K) {
    const p3 = rp.time5K * (3 / 5) ** 1.06;
    ins.push([`Garmin's model puts you at about ${fmtTime(p3)} for 3K`, `Scaled from its ${fmtTime(rp.time5K)} 5K prediction. ${p3 < (best?.y ?? Infinity) ? "That's quicker than your best, so a faster 3K may be in you." : "Your real result already beats it."}`]);
  }
  if (best) {
    const next = Math.floor((best.y - 1) / 15) * 15; // next 15-second barrier
    ins.push([`Next target: ${fmtTime(next)}`, `That's ${fmtPace(next / 3)}, ${Math.round(best.y / 3 - next / 3)} s/km quicker than your best. Your 1K PR is ${(() => { const pr = (DATA.personalRecords || []).find((p) => p.typeId === 1); return pr ? fmtTime(pr.value) : "–"; })()}.`]);
  }
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const recentRuns = runs.filter((r) => now - r.date <= 180 * DAY);
  if (recentRuns.length >= 10) {
    const cnt = Array(7).fill(0); recentRuns.forEach((r) => cnt[r.date.getDay()]++);
    const top = cnt.indexOf(Math.max(...cnt)), low = cnt.indexOf(Math.min(...cnt));
    ins.push([`${days[top]} is your running day`, `${cnt[top]} of your last ${recentRuns.length} runs were on a ${days[top]}. ${days[low]} is the quietest (${cnt[low]}).`]);
  }
  const other = acts.filter((a) => !a.isRun && now - a.date <= 90 * DAY);
  if (other.length) {
    const c = {}; other.forEach((a) => (c[a.type] = (c[a.type] || 0) + 1));
    const nice = (t) => t.replace(/_v\d+$/, "").replace(/_/g, " ");
    const list = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${n} ${nice(t)}`).join(", ");
    ins.push(["Cross-training, last 90 days", `${list}. Strength work helps hold 3K speed.`]);
  }
  const lastStrength = acts.filter((a) => a.type === "strength_training").sort((a, b) => b.date - a.date)[0];
  if (lastStrength && daysAgo(lastStrength.date, now) > 21)
    ins.push(["Strength has gone quiet", `Your last strength session was ${plural(daysAgo(lastStrength.date, now), "day")} ago. One or two a week supports speed and keeps injuries away.`]);

  COACH_CTX.insights = ins.map(([h, b]) => `${h}. ${b}`);
  $("#insights").replaceChildren(...ins.map(([h, b]) => { const li = el("li"); li.append(el("span", { class: "h" }, h), el("span", { class: "b" }, b)); return li; }));
}

// ---------- AI coach (only where the Claude viewer offers it) ----------
function coachSummary({ runs, acts, goal, best, now }) {
  const L = [];
  L.push(`Athlete: ${DATA.name || "runner"}. Today: ${now.toDateString()}. Data synced ${DATA.generatedAt}.`);
  L.push(`Main goal: ${goal.label} in ${fmtTime(goal.targetSeconds)} (${fmtPace(goal.targetSeconds / 3)}). ${best ? `Best: ${fmtTime(best.y)} on ${fmtDateY(best.t)} (${best.how}). ACHIEVED.` : "Not yet achieved."}`);
  L.push("", "Maintenance checks:", ...(COACH_CTX.checks || []).map((c) => "- " + c));
  L.push("", "Insights:", ...(COACH_CTX.insights || []).map((c) => "- " + c));
  const rp = Array.isArray(DATA.racePredictions) ? DATA.racePredictions[0] : DATA.racePredictions;
  if (rp) L.push("", `Garmin race predictions: 5K ${fmtTime(rp.time5K)}, 10K ${fmtTime(rp.time10K)}, HM ${fmtTime(rp.timeHalfMarathon)}, M ${fmtTime(rp.timeMarathon)}.`);
  const prs = (DATA.personalRecords || []).filter((p) => p.label);
  if (prs.length) L.push("Garmin PRs: " + prs.map((p) => `${p.label} ${p.typeId === 7 ? km(p.value).toFixed(1) + " km" : fmtTime(p.value)} (${(p.date || "").slice(0, 10)})`).join("; "));
  const vo2 = runs.find((r) => r.vo2max)?.vo2max;
  if (vo2) L.push(`VO2max (Garmin): ${vo2}.`);
  const ws = weekStart(now), weeks = [];
  for (let i = 15; i >= 0; i--) { const w = new Date(ws); w.setDate(w.getDate() - i * 7); const inW = runs.filter((r) => +weekStart(r.date) === +w); weeks.push(`${fmtDate(w)}: ${km(inW.reduce((a, r) => a + r.distance, 0)).toFixed(1)} km/${inW.length} runs`); }
  L.push("", "Weekly running volume, last 16 weeks (week starting Monday): " + weeks.join("; "));
  L.push("", "Last 40 runs (date | type | km | time | pace/km | avg HR | max HR):");
  for (const r of runs.slice(0, 40)) {
    const tt = r.movingDuration || r.duration;
    L.push(`${r.start.slice(0, 10)} | ${r.type.replace("_running", "").replace("running", "outdoor")} | ${km(r.distance).toFixed(2)} | ${fmtTime(tt)} | ${fmtTime(tt / km(r.distance))} | ${r.avgHR ? Math.round(r.avgHR) : "-"} | ${r.maxHR ? Math.round(r.maxHR) : "-"}`);
  }
  const other = acts.filter((a) => !a.isRun && now - a.date <= 90 * DAY);
  const c = {}; other.forEach((a) => (c[a.type] = (c[a.type] || 0) + 1));
  L.push("", "Other activities, last 90 days: " + (Object.entries(c).map(([k, v]) => `${k} ×${v}`).join(", ") || "none"));
  const lastStr = acts.filter((a) => a.type === "strength_training").sort((a, b) => b.date - a.date)[0];
  if (lastStr) L.push(`Last strength session: ${lastStr.start.slice(0, 10)}.`);
  const daily = (DATA.daily || []).filter((d) => d.restingHR);
  if (daily.length) L.push("Resting HR last 30 days: " + daily.map((d) => d.restingHR).join(", ") + ".");
  return L.join("\n");
}

const COACH_RULES = `You are an experienced, encouraging but honest running coach for a middle-distance runner. Base everything on the athlete's Garmin data below; cite specific numbers and dates from it. Be concrete: paces in min/km, distances, rep schemes, rest. Prioritise injury prevention when load jumps. Note that some 3K times are whole runs scaled to 3,000 m and treadmill pace can read fast. Don't invent data that isn't there. Keep it short and practical.`;

function mdInto(node, text) {
  // Tiny, safe markdown: paragraphs, "- " bullets, **bold**. Everything goes in as text nodes.
  node.replaceChildren();
  const inline = (parent, s) => s.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) parent.append(el("strong", {}, part.slice(2, -2)));
    else if (part) parent.append(document.createTextNode(part));
  });
  let ul = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^#+\s*/, "").trimEnd();
    const b = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (b) { if (!ul) { ul = el("ul"); node.append(ul); } const li = el("li"); inline(li, b[1]); ul.append(li); continue; }
    ul = null;
    if (line.trim()) { const p = el("p"); inline(p, line); node.append(p); }
  }
}

function coachErrorCopy(e) {
  switch (e?.code) {
    case "rate_limited": return "Claude is busy or you've hit a usage limit. Try again in a bit.";
    case "session_expired": return "Sign in to Claude again, then retry.";
    case "refused": return "Claude didn't answer that. Try rephrasing.";
    case "invalid_json": case "empty_completion": return "The review came back garbled. Tap Review again.";
    default: return "Something went wrong reaching Claude. Try again.";
  }
}

let coachSetUp = false;
async function setupCoach() {
  if (coachSetUp) return; coachSetUp = true;
  if (!window.claude?.use) return;           // the public GitHub site: no coach
  let sample = null;
  try { sample = await window.claude.use("sample"); } catch { sample = null; }
  if (!sample) return;
  const card = $("#coach"); card.hidden = false;
  const hide = () => { card.hidden = true; };
  const status = $("#coach-status"), review = $("#coach-review"), runBtn = $("#coach-run"), stopBtn = $("#coach-stop");
  const FLAG = "coach-opted-in";
  const store = { get: () => { try { return localStorage.getItem(FLAG); } catch { return null; } }, set: () => { try { localStorage.setItem(FLAG, "1"); } catch {} } };
  let ctl = null;
  stopBtn.onclick = () => ctl?.abort();

  const renderReview = (r) => {
    review.replaceChildren(); review.hidden = false;
    if (r.headline) review.append(el("p", { class: "cr-headline" }, String(r.headline)));
    if (r.assessment) review.append(el("p", { class: "cr-text" }, String(r.assessment)));
    const cols = el("div", { class: "cr-cols" });
    for (const [title, list] of [["What's working", r.strengths], ["What to fix", r.concerns]]) {
      if (!Array.isArray(list) || !list.length) continue;
      const box = el("div"); box.append(el("h3", {}, title));
      const ul = el("ul"); list.slice(0, 5).forEach((x) => ul.append(el("li", {}, String(x)))); box.append(ul); cols.append(box);
    }
    if (cols.children.length) review.append(cols);
    if (Array.isArray(r.weekPlan) && r.weekPlan.length) {
      const plan = el("div", { class: "cr-plan" }); plan.append(el("h3", {}, "Your next 7 days"));
      const days = el("div", { class: "days" });
      r.weekPlan.slice(0, 7).forEach((d) => {
        const row = el("div", { class: "day" }), body = el("div");
        body.append(el("div", { class: "s" }, String(d.session || "")), el("div", { class: "x" }, String(d.detail || "")));
        row.append(el("div", { class: "d" }, String(d.day || "")), body); days.append(row);
      });
      plan.append(days); review.append(plan);
    }
    if (r.nextGoal) review.append(el("p", { class: "cr-text" }, "Next goal: " + String(r.nextGoal)));
    review.append(el("p", { class: "cr-meta" }, `Based on data synced ${new Date(DATA.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`));
  };

  const runReview = async (refresh) => {
    ctl = new AbortController();
    runBtn.disabled = true; stopBtn.hidden = false; status.textContent = "Your coach is reading your training…";
    const tomorrow = new Date(Date.now() + DAY);
    const prompt = `${COACH_RULES}

Write a training review and a plan for the next 7 days starting ${tomorrow.toDateString()}. The athlete already hit their 3K goal; the job now is to hold that fitness and build toward the next target.

Reply with only a JSON object of this shape:
{"headline": "one punchy sentence verdict", "assessment": "3-4 sentences on where they are, citing numbers", "strengths": ["up to 4 short points"], "concerns": ["up to 4 short points, each with the fix"], "weekPlan": [{"day": "Fri 6", "session": "Easy run 5 km", "detail": "pace / reps / why"}], "nextGoal": "a specific next target with a realistic date"}
weekPlan has exactly 7 entries, one per day, rest days included.

ATHLETE DATA
${COACH_CTX.summary()}`;
    try {
      const r = await sample.json(prompt, { signal: ctl.signal, cache: { gcTime: 864e5, refresh: !!refresh } });
      store.set(); status.textContent = ""; renderReview(r || {}); runBtn.textContent = "Refresh review";
    } catch (e) {
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e?.code)) return hide();
      status.textContent = e?.code === "cancelled" ? "" : coachErrorCopy(e);
    } finally { runBtn.disabled = false; stopBtn.hidden = true; }
  };
  runBtn.onclick = () => runReview(review.hidden === false);
  if (store.get()) runReview(false);       // replays today's review from cache when nothing changed

  // chat
  const log = $("#chat-log"), form = $("#chat-form"), input = $("#chat-input"), send = $("#chat-send");
  const turns = [];
  const bubble = (who, text) => { const b = el("div", { class: "msg " + who }); if (who === "me") b.textContent = text; else mdInto(b, text); log.append(b); return b; };
  const ask = async (q) => {
    if (!q.trim() || send.disabled) return;
    input.value = ""; bubble("me", q); turns.push({ role: "user", content: q });
    const b = bubble("coach", "Thinking…"); send.disabled = true;
    const c = new AbortController();
    try {
      const head = [{ role: "user", content: `${COACH_RULES} Answer the athlete's questions in a few short paragraphs or bullets.\n\nATHLETE DATA\n${COACH_CTX.summary()}` }];
      const { text } = await sample([...head, ...turns.slice(-10)], { cache: false, signal: c.signal, onText: ({ text }) => mdInto(b, text) });
      mdInto(b, text); turns.push({ role: "assistant", content: text }); store.set();
    } catch (e) {
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e?.code)) return hide();
      if (e?.text) mdInto(b, e.text); else b.textContent = coachErrorCopy(e);
      turns.pop();
    } finally { send.disabled = false; }
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  const chips = ["How do I get to 16:00?", "Am I running too much or too little?", "What should my easy pace be?", "Plan a 3K time trial"];
  $("#chat-chips").replaceChildren(...chips.map((q) => { const b = el("button", { class: "chip", type: "button" }, q); b.onclick = () => ask(q); return b; }));
}

// ---------- render ----------
let DATA, CONFIG;
const COACH_CTX = {};
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

  renderMaintenance({ runs, acts, goal, best, efforts, now });
  COACH_CTX.summary = () => coachSummary({ runs, acts, goal, best, now });
  setupCoach();

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
    const yearAgo = new Date(now - 365 * 864e5);
    const recentEfforts = efforts.filter((e) => e.t >= yearAgo && e.y <= goal.targetSeconds * 1.35);
    timeChart($("#c3k"), recentEfforts, { invert: true, goal: goal.targetSeconds, goalLabel: `Goal ${fmtTime(goal.targetSeconds)}`, fmtY: fmtTime,
      yTicks: timeTicks, ptClass: (p) => (p.y <= goal.targetSeconds ? "under" : ""),
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
    timeChart($("#cpace"), pacePts, { invert: true, line: false, fmtY: (v) => fmtTime(v), yTicks: timeTicks, goal: goal.targetSeconds / (goal.distanceMeters / 1000), goalLabel: "3K goal pace" });

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

const inline = (id) => { const n = document.getElementById(id); return n ? JSON.parse(n.textContent) : undefined; };
Promise.all([
  inline("cfg-json") ?? fetch("config.json").then((r) => r.json()),
  inline("garmin-json") ?? fetch("data/garmin.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
]).then(([cfg, data]) => {
  CONFIG = cfg;
  if (!data) { $("#app").hidden = true; $("#setup").hidden = false; return; }
  DATA = data;
  render();
});
})();
