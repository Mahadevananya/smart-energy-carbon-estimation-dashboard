"use strict";
/* =====================================================================
   SMART ENERGY MANAGEMENT MODULE (vanilla JavaScript)
   Everything here is an ESTIMATE from sample data typed by the user.
   There is no live meter, sensor, server or database.
   File layout:  1 CONFIG  2 SAMPLE DATA  3 CALCULATIONS  4 READ INPUTS
                 5 RENDER  6 SELF-TEST  7 START-UP
   ===================================================================== */


/* ---------- 1. CONFIG: every number you may want to change ---------- */
const SE_CONFIG = {
  // Alert thresholds (from the research notes, section 4B)
  spikeFactor: 1.25,        // a day above 1.25 x the 14-day average = spike
  dominantShare: 0.40,      // one appliance above 40% of monthly kWh
  standbyShare: 0.05,       // standby above 5% of monthly kWh
  eveningShare: 0.40,       // 6-10 PM above 40% of monthly kWh
  slabLimits: [100, 200, 300, 400],  // slab boundaries in units (kWh)
  slabWarnGap: 10,          // warn when within 10 units BELOW a boundary

  // Efficiency score (research notes, section 4E)
  trendMax: 40,  trendFullAt: 0.25,    // 25% more than last month = full 40-point penalty
  standbyMax: 30, standbyFullAt: 0.10, // 10 points above 5% = full 30-point penalty
  peakMax: 30,   peakFullAt: 0.30,     // 30 points above 40% = full 30-point penalty

  // Bands are checked from the top down; first match wins
  bands: [
    { min: 85, label: "Excellent",    css: "se-excellent" },
    { min: 70, label: "Good",         css: "se-good" },
    { min: 50, label: "Fair",         css: "se-fair" },
    { min: 0,  label: "Needs action", css: "se-action" }
  ],

  // The four usage windows
  windows: [
    { key: "morning", label: "Morning peak (6-10 AM)", short: "Morning", peak: true },
    { key: "day",     label: "Daytime (10 AM-6 PM)",   short: "Daytime", peak: false },
    { key: "evening", label: "Evening peak (6-10 PM)", short: "Evening", peak: true },
    { key: "night",   label: "Night (10 PM-6 AM)",     short: "Night",   peak: false }
  ],

  // Lower number = shown first
  severityOrder: { critical: 0, warning: 1, info: 2 }
};


/* ---------- 2. SAMPLE DATA (made up, for demonstration only) ---------- */
const SE_SAMPLE = {
  lastMonthKwh: 380,
  dailyLog: [13, 14, 12, 15, 14, 13, 14, 16, 13, 14, 15, 22, 14, 13],
  appliances: [
    { name: "Air conditioner",   zone: "Home", kwh: 170, standbyKwh: 6, window: "evening" },
    { name: "Refrigerator",      zone: "Home", kwh: 60,  standbyKwh: 0, window: "day" },
    { name: "Ceiling fans",      zone: "Home", kwh: 40,  standbyKwh: 0, window: "night" },
    { name: "Lights",            zone: "Home", kwh: 30,  standbyKwh: 0, window: "evening" },
    { name: "TV and set-top box", zone: "Home", kwh: 25, standbyKwh: 9, window: "evening" },
    { name: "Computer",          zone: "Home", kwh: 30,  standbyKwh: 7, window: "evening" },
    { name: "Washing machine",   zone: "Home", kwh: 20,  standbyKwh: 3, window: "morning" },
    { name: "Water heater",      zone: "Home", kwh: 25,  standbyKwh: 0, window: "morning" },
    { name: "Mixer and iron",    zone: "Home", kwh: 20,  standbyKwh: 0, window: "morning" }
  ]
};


/* ---------- 3. CALCULATIONS ----------
   These are "pure" functions: data goes in, an answer comes out.
   They never touch the page, so they are easy to test and to reuse. */

// Add up the monthly kWh of all appliances
function seTotalKwh(appliances) {
  return appliances.reduce((sum, a) => sum + a.kwh, 0);
}

// Add up standby kWh of all appliances
function seStandbyKwh(appliances) {
  return appliances.reduce((sum, a) => sum + a.standbyKwh, 0);
}

// kWh used in each of the four windows -> { morning: .., day: .., evening: .., night: .. }
function seWindowTotals(appliances) {
  const totals = { morning: 0, day: 0, evening: 0, night: 0 };
  appliances.forEach(a => { totals[a.window] += a.kwh; });
  return totals;
}

// Share of the month's kWh used 6-10 PM, as a fraction (0.6 = 60%). Safe if total is 0.
function seEveningShare(appliances) {
  const total = seTotalKwh(appliances);
  return total > 0 ? seWindowTotals(appliances).evening / total : 0;
}

// Efficiency score, using the exact formula from the research notes:
// Score = 100 - P_trend - P_standby - P_peak
function seCalcScore(data) {
  const c = SE_CONFIG;
  const total = seTotalKwh(data.appliances);
  const standbyShare = total > 0 ? seStandbyKwh(data.appliances) / total : 0;
  const eveningShare = seEveningShare(data.appliances);

  // How much higher than last month? (0 if lower, or if last month is unknown)
  const growth = data.lastMonthKwh > 0 ? total / data.lastMonthKwh - 1 : 0;

  const pTrend   = Math.min(c.trendMax,   c.trendMax   * Math.max(0, growth) / c.trendFullAt);
  const pStandby = Math.min(c.standbyMax, c.standbyMax * Math.max(0, standbyShare - c.standbyShare) / c.standbyFullAt);
  const pPeak    = Math.min(c.peakMax,    c.peakMax    * Math.max(0, eveningShare - c.eveningShare) / c.peakFullAt);

  const score = Math.round(100 - pTrend - pStandby - pPeak);
  const band = c.bands.find(b => score >= b.min);
  return { score, band, pTrend, pStandby, pPeak };
}

// Build the list of alerts, then sort most severe first
function seCalcAlerts(data) {
  const c = SE_CONFIG;
  const alerts = [];
  const total = seTotalKwh(data.appliances);
  const pct = x => Math.round(x * 100);

  // Rule 1: daily spike (any day above 1.25 x the 14-day average)
  if (data.dailyLog.length > 0) {
    const avg = data.dailyLog.reduce((s, v) => s + v, 0) / data.dailyLog.length;
    data.dailyLog.forEach((kwh, i) => {
      if (avg > 0 && kwh > c.spikeFactor * avg) {
        alerts.push({ severity: "warning", title: "Daily usage spike",
          message: "Day " + (i + 1) + " used " + pct(kwh / avg - 1) + "% above your 14-day average (" + kwh + " kWh vs " + avg.toFixed(1) + " kWh)." });
      }
    });
  }

  if (total > 0) {
    // Rule 2: dominant appliance
    data.appliances.forEach(a => {
      if (a.kwh / total > c.dominantShare) {
        alerts.push({ severity: "warning", title: "Dominant appliance",
          message: a.name + " is " + pct(a.kwh / total) + "% of your monthly load." });
      }
    });

    // Rule 3: standby load
    const standby = seStandbyKwh(data.appliances) / total;
    if (standby > c.standbyShare) {
      alerts.push({ severity: "info", title: "Standby load",
        message: "Standby is about " + pct(standby) + "% of use. Switch devices off at the plug." });
    }

    // Rule 4: evening peak
    const evening = seEveningShare(data.appliances);
    if (evening > c.eveningShare) {
      alerts.push({ severity: "info", title: "Evening peak",
        message: pct(evening) + "% of your load runs 6-10 PM." });
    }

    // Rule 5: slab cliff (a little BELOW 100, 200, 300 or 400 units)
    c.slabLimits.forEach(limit => {
      const gap = limit - total;
      if (gap > 0 && gap <= c.slabWarnGap) {
        alerts.push({ severity: "warning", title: "Slab limit close",
          message: "You are " + gap.toFixed(1) + " units below the " + limit + "-unit slab. Going over it moves units into a higher-rate slab (estimate)." });
      }
    });
  }

  // Sort: critical, then warning, then info
  alerts.sort((a, b) => c.severityOrder[a.severity] - c.severityOrder[b.severity]);
  return alerts;
}


/* ---------- 4. READ INPUTS FROM THE PAGE ---------- */

// Turn any text into a safe number: blanks and negatives become 0
function seNum(value) {
  return Math.max(0, Number(value) || 0);
}

function seReadInputs() {
  const rows = document.querySelectorAll(".se-row");
  return {
    lastMonthKwh: seNum(document.getElementById("se-last-month").value),
    dailyLog: Array.from(document.querySelectorAll(".se-day")).map(i => seNum(i.value)),
    appliances: Array.from(rows).map(row => {
      const kwh = seNum(row.querySelector(".se-kwh").value);
      return {
        name: row.querySelector(".se-name").value.trim() || "Unnamed appliance",
        zone: row.querySelector(".se-zone").value.trim() || "Home",
        kwh: kwh,
        standbyKwh: Math.min(seNum(row.querySelector(".se-standby").value), kwh), // standby can't exceed total
        window: row.querySelector(".se-window").value
      };
    })
  };
}


/* ---------- 5. RENDER (draw results on the page) ---------- */

// Small helper: make an element with a class and text.
// textContent (not innerHTML) keeps typed names from being treated as code.
function seEl(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// A labelled input box used inside appliance rows
function seField(labelText, control, extraClass) {
  const wrap = seEl("div", "se-field " + (extraClass || ""));
  wrap.appendChild(seEl("label", "", labelText));
  wrap.appendChild(control);
  return wrap;
}

function seInput(type, className, value) {
  const i = document.createElement("input");
  i.type = type; i.className = className; i.value = value;
  if (type === "number") { i.min = "0"; i.step = "any"; }
  return i;
}

// Build one editable appliance row
function seBuildRow(app) {
  const row = seEl("div", "se-row");
  row.appendChild(seField("Appliance", seInput("text", "se-name", app.name), "se-span2"));
  row.appendChild(seField("kWh / month", seInput("number", "se-kwh", app.kwh)));
  row.appendChild(seField("Standby kWh", seInput("number", "se-standby", app.standbyKwh)));
  row.appendChild(seField("Zone (optional)", seInput("text", "se-zone", app.zone)));

  const sel = document.createElement("select");
  sel.className = "se-window";
  SE_CONFIG.windows.forEach(w => {
    const o = document.createElement("option");
    o.value = w.key; o.textContent = w.label;
    if (w.key === app.window) o.selected = true;
    sel.appendChild(o);
  });
  row.appendChild(seField("Usage window", sel, "se-span2"));

  const del = seEl("button", "se-remove", "Remove");
  del.type = "button";
  del.addEventListener("click", () => { row.remove(); seUpdate(); });
  row.appendChild(del);
  return row;
}

// Fill the page inputs from a data object (used at start and by "Reload sample data")
function seLoadData(data) {
  document.getElementById("se-last-month").value = data.lastMonthKwh;

  const logBox = document.getElementById("se-daily-log");
  logBox.textContent = "";
  data.dailyLog.forEach((kwh, i) => {
    const cell = seEl("div");
    const label = seEl("label", "", "Day " + (i + 1));
    const input = seInput("number", "se-day", kwh);
    cell.appendChild(label); cell.appendChild(input);
    logBox.appendChild(cell);
  });

  const rows = document.getElementById("se-appliance-rows");
  rows.textContent = "";
  data.appliances.forEach(a => rows.appendChild(seBuildRow(a)));
  seUpdate();
}

function seRenderAlerts(alerts) {
  document.getElementById("se-alert-count").textContent = alerts.length;
  const list = document.getElementById("se-alert-list");
  list.textContent = "";
  if (alerts.length === 0) {
    list.appendChild(seEl("li", "", "No alerts for the current inputs."));
  }
  alerts.forEach(a => {
    const li = seEl("li", "se-sev-" + a.severity);
    li.appendChild(seEl("span", "se-sev", a.severity.toUpperCase() + ":"));
    li.appendChild(seEl("strong", "", a.title + ". "));
    li.appendChild(seEl("span", "", a.message));
    list.appendChild(li);
  });
  // This is the real time the calculation ran, read from the device clock. No made-up times.
  document.getElementById("se-ran-at").textContent =
    "Calculated on this device at " + new Date().toLocaleTimeString() + ". Based on the inputs above.";
}

function seRenderScore(result) {
  document.getElementById("se-score-value").textContent = result.score;
  const band = document.getElementById("se-score-band");
  band.textContent = result.band.label;
  band.className = "se-score-band " + result.band.css;

  const list = document.getElementById("se-score-breakdown");
  list.textContent = "";
  [
    "Started at 100",
    "Usage growth vs last month: -" + result.pTrend.toFixed(1) + " (max 40)",
    "Standby share above 5%: -" + result.pStandby.toFixed(1) + " (max 30)",
    "Evening share above 40%: -" + result.pPeak.toFixed(1) + " (max 30)"
  ].forEach(t => list.appendChild(seEl("li", "", t)));
}

function seRenderWindows(appliances) {
  const totals = seWindowTotals(appliances);
  const max = Math.max(...SE_CONFIG.windows.map(w => totals[w.key]), 1); // avoid dividing by 0
  const chart = document.getElementById("se-window-chart");
  chart.textContent = "";
  SE_CONFIG.windows.forEach(w => {
    const col = seEl("div", "se-col");
    col.appendChild(seEl("strong", "", totals[w.key].toFixed(1) + " kWh"));
    const track = seEl("div", "se-track");
    const bar = seEl("div", "se-bar" + (w.peak ? " se-peak" : ""));
    bar.style.height = (totals[w.key] / max * 100) + "%";
    track.appendChild(bar);
    col.appendChild(track);
    col.appendChild(seEl("span", "", w.short));
    chart.appendChild(col);
  });
  const share = seEveningShare(appliances);
  document.getElementById("se-evening-share").textContent =
    "Evening peak (6-10 PM) share: " + (share * 100).toFixed(1) + "% of estimated monthly kWh";
}

function seRenderRanked(appliances) {
  const box = document.getElementById("se-ranked");
  box.textContent = "";
  const sorted = appliances.slice().sort((a, b) => b.kwh - a.kwh); // biggest first (copy so original order stays)
  const max = Math.max(...sorted.map(a => a.kwh), 1);
  sorted.forEach(a => {
    const row = seEl("div", "se-rank-row");
    const head = seEl("div", "se-rank-head");
    const left = seEl("span", "", a.name + " ");
    left.appendChild(seEl("span", "se-rank-zone", "(" + a.zone + ")"));
    head.appendChild(left);
    head.appendChild(seEl("strong", "", a.kwh.toFixed(1) + " kWh"));
    const track = seEl("div", "se-rank-track");
    const bar = seEl("div", "se-rank-bar");
    bar.style.width = (a.kwh / max * 100) + "%";
    track.appendChild(bar);
    row.appendChild(head); row.appendChild(track);
    box.appendChild(row);
  });
}

// The one function that refreshes everything
function seUpdate() {
  const data = seReadInputs();
  seRenderAlerts(seCalcAlerts(data));
  seRenderScore(seCalcScore(data));
  seRenderWindows(data.appliances);
  seRenderRanked(data.appliances);
}


/* ---------- 6. SELF-TEST ---------- */
function seRunSelfTest() {
  const results = [];
  const check = (name, ok) => results.push({ name, ok });
  const near = (a, b) => Math.abs(a - b) < 0.01;

  // Helper: a one-appliance data set with a chosen total
  const single = (kwh, win, standby) => ({
    lastMonthKwh: kwh, dailyLog: [10, 10, 10, 10],
    appliances: [{ name: "Test", zone: "Home", kwh: kwh, standbyKwh: standby || 0, window: win || "day" }]
  });

  // Sample data, checked against hand calculation
  const s = SE_SAMPLE;
  check("Sample total is 420 kWh", seTotalKwh(s.appliances) === 420);
  check("Four windows add up to the total",
    near(Object.values(seWindowTotals(s.appliances)).reduce((a, b) => a + b, 0), 420));
  check("Sample evening share is 255/420 = 60.7%", near(seEveningShare(s.appliances), 255 / 420));
  const sc = seCalcScore(s);
  check("Sample score is 60 (Fair)", sc.score === 60 && sc.band.label === "Fair");

  // Score edge cases
  check("No penalties gives 100 (Excellent)",
    seCalcScore(single(100, "day")).score === 100 && seCalcScore(single(100, "day")).band.label === "Excellent");
  check("Worst case gives 0 (Needs action)",
    seCalcScore({ lastMonthKwh: 100, appliances: [{ name: "x", zone: "Home", kwh: 200, standbyKwh: 200, window: "evening" }] }).score === 0);
  check("Empty appliance list does not crash", seCalcScore({ lastMonthKwh: 0, appliances: [] }).score === 100);

  // Alerts
  const titles = seCalcAlerts(s).map(a => a.title);
  check("Spike alert found (day 12)", titles.includes("Daily usage spike"));
  check("Dominant appliance alert found", titles.includes("Dominant appliance"));
  check("Standby alert found", titles.includes("Standby load"));
  check("Evening peak alert found", titles.includes("Evening peak"));
  check("No slab alert at 420 units", !titles.includes("Slab limit close"));
  check("Slab alert at 195 units", seCalcAlerts(single(195)).some(a => a.title === "Slab limit close"));
  check("No slab alert at 150 units", !seCalcAlerts(single(150)).some(a => a.title === "Slab limit close"));
  const order = seCalcAlerts(s).map(a => SE_CONFIG.severityOrder[a.severity]);
  check("Alerts are sorted by severity", order.every((v, i) => i === 0 || order[i - 1] <= v));

  // Show results
  const out = document.getElementById("se-test-output");
  out.textContent = "";
  results.forEach(r => out.appendChild(seEl("li", r.ok ? "se-pass" : "se-fail", (r.ok ? "PASS: " : "FAIL: ") + r.name)));
  const passed = results.filter(r => r.ok).length;
  out.appendChild(seEl("li", "", passed + " of " + results.length + " tests passed."));
}


/* ---------- 7. START-UP ---------- */
document.addEventListener("DOMContentLoaded", () => {
  seLoadData(SE_SAMPLE);

  // Recalculate whenever the user types or changes a dropdown anywhere in the module
  const root = document.getElementById("se-module");
  root.addEventListener("input", seUpdate);
  root.addEventListener("change", seUpdate);

  document.getElementById("se-add-row").addEventListener("click", () => {
    document.getElementById("se-appliance-rows")
      .appendChild(seBuildRow({ name: "New appliance", zone: "Home", kwh: 0, standbyKwh: 0, window: "day" }));
    seUpdate();
  });
  document.getElementById("se-load-sample").addEventListener("click", () => seLoadData(SE_SAMPLE));
  document.getElementById("se-run-test").addEventListener("click", seRunSelfTest);
});
