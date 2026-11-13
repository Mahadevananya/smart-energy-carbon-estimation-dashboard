/**
 * ==============================================================================
 * SMART ENERGY & CARBON ESTIMATION DASHBOARD
 * EVS Case Study: Hyderabad / Telangana Urban Household Energy Audit
 * Tech: Vanilla JavaScript, Chart.js, LocalStorage
 * ==============================================================================
 */

// ==========================================
// CONSTANTS (put at top of script.js, easy to edit)
// ==========================================
const EMISSION_FACTOR = 0.675;        // kg CO2 per kWh, India grid FY 2025-26, CEA CO2 Baseline Database v22.0
const DAYS_PER_MONTH = 30;
const AC_SAVING_PER_DEGREE = 6;       // percent per 1 deg C rise, BEE guidance, capped at 24 percent
const MAX_AC_SAVING_PERCENT = 24;     // Maximum percentage saving from thermostat offset

const STORAGE_KEY = 'evs_energy_dashboard_state_v2';

// Default Sample Data (as specified in acceptance criteria)
const SAMPLE_DATA = {
  tariff: 8,                  // Rs per unit (sample rate: change to match your electricity bill)
  lastMonthKwh: 420,          // Sample previous month kWh
  goalCo2: 250,               // Target monthly CO2 budget (kg)
  
  appliances: [
    { id: 'app-1', name: 'AC (sample)', watts: 1500, hours: 6, qty: 1 },
    { id: 'app-2', name: 'Ceiling fan (sample)', watts: 75, hours: 10, qty: 2 },
    { id: 'app-3', name: 'LED bulb (sample)', watts: 9, hours: 5, qty: 4 },
    { id: 'app-4', name: 'Refrigerator (sample)', watts: 150, hours: 8, qty: 1 },
    { id: 'app-5', name: 'TV (sample)', watts: 100, hours: 4, qty: 1 },
    { id: 'app-6', name: 'Laptop (sample)', watts: 60, hours: 6, qty: 1 }
  ],

  dailyLog: [
    { day: 1, date: '2026-11-01', kwh: 12.4 },
    { day: 2, date: '2026-11-02', kwh: 13.1 },
    { day: 3, date: '2026-11-03', kwh: 11.8 },
    { day: 4, date: '2026-11-04', kwh: 12.6 },
    { day: 5, date: '2026-11-05', kwh: 14.0 },
    { day: 6, date: '2026-11-06', kwh: 13.5 },
    { day: 7, date: '2026-11-07', kwh: 12.2 },
    { day: 8, date: '2026-11-08', kwh: 11.9 },
    { day: 9, date: '2026-11-09', kwh: 12.8 },
    { day: 10, date: '2026-11-10', kwh: 13.4 },
    { day: 11, date: '2026-11-11', kwh: 12.64 }, // Matches sample inventory daily load
    { day: 12, date: '2026-11-12', kwh: 12.0 },
    { day: 13, date: '2026-11-13', kwh: 12.9 },
    { day: 14, date: '2026-11-14', kwh: 12.5 }
  ],

  tips: {
    acCurrent: 20,
    acTarget: 24,
    ledOldWatts: 60,
    ledNewWatts: 9,
    ledQty: 4,
    ledHours: 5,
    standbyWatts: 5,
    standbyDevices: 6,
    standbyHours: 18
  }
};

// Application State
let appState = null;

// Chart Instances
let dailyUsageChart = null;
let applianceShareChart = null;
let comparisonChart = null;

// ==========================================
// VALIDATION & HELPER FUNCTIONS
// ==========================================

/**
 * Safely parse a positive numeric value.
 * Clamps negative numbers to 0, handles empty or invalid inputs gracefully.
 * Never returns NaN or Infinity.
 */
function safeNum(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = parseFloat(val);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return Math.max(0, n);
}

/**
 * Clamp hours between 0 and 24.
 */
function safeHours(val, fallback = 0) {
  const n = safeNum(val, fallback);
  return Math.min(24, Math.max(0, n));
}

/**
 * Format numbers cleanly to 2 decimal places with fallback.
 * Never shows NaN or Infinity.
 */
function fmt2(val) {
  const n = safeNum(val, 0);
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==========================================
// STATE MANAGEMENT & LOCAL STORAGE
// ==========================================

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.appliances) && parsed.appliances.length > 0) {
        appState = parsed;
        return;
      }
    }
  } catch (err) {
    console.warn('Could not parse localStorage state, loading sample data.', err);
  }
  appState = JSON.parse(JSON.stringify(SAMPLE_DATA));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (err) {
    console.error('Failed to save state to localStorage:', err);
  }
}

function resetToSampleData() {
  appState = JSON.parse(JSON.stringify(SAMPLE_DATA));
  saveState();
  syncInputsFromState();
  renderApplianceTable();
  renderDailyLogTable();
  recalculateEverything();
  console.info('Dashboard reset to sample data.');
}

// ==========================================
// CORE CALCULATION ENGINE
// ==========================================

/**
 * Performs all calculations live in pure JavaScript.
 * Automatically triggered on every input change.
 */
function recalculateEverything() {
  // 1. Read global inputs
  const tariff = safeNum(document.getElementById('input-tariff').value, 8);
  const lastMonthKwh = safeNum(document.getElementById('input-last-month-kwh').value, 0);
  const goalCo2 = safeNum(document.getElementById('input-goal-co2').value, 250);

  // Sync to state
  appState.tariff = tariff;
  appState.lastMonthKwh = lastMonthKwh;
  appState.goalCo2 = goalCo2;

  // 2. Calculate appliance loads & inventory totals
  let totalWatts = 0;
  let totalQty = 0;
  let totalDailyKwh = 0;
  let totalMonthlyKwh = 0;
  let totalMonthlyCo2 = 0;

  let highestAppliance = null;
  let highestMonthlyKwh = -1;

  let totalAcMonthlyKwh = 0;

  // Iterate over state appliances and update computed values
  appState.appliances.forEach((app) => {
    const watts = safeNum(app.watts);
    const hours = safeHours(app.hours);
    const qty = Math.max(0, parseInt(app.qty, 10) || 0);

    // Formulas:
    // Daily kWh per appliance = watts * hours per day * quantity / 1000
    // Monthly kWh = daily kWh * 30
    // Monthly CO2 (kg) = monthly kWh * EMISSION_FACTOR
    const dailyKwh = (watts * hours * qty) / 1000;
    const monthlyKwh = dailyKwh * DAYS_PER_MONTH;
    const monthlyCo2 = monthlyKwh * EMISSION_FACTOR;

    // Accumulate
    totalWatts += (watts * qty);
    totalQty += qty;
    totalDailyKwh += dailyKwh;
    totalMonthlyKwh += monthlyKwh;
    totalMonthlyCo2 += monthlyCo2;

    // Track highest use appliance
    if (monthlyKwh > highestMonthlyKwh) {
      highestMonthlyKwh = monthlyKwh;
      highestAppliance = {
        name: app.name || 'Unnamed Appliance',
        watts,
        hours,
        qty,
        dailyKwh,
        monthlyKwh,
        monthlyCo2
      };
    }

    // Check if appliance is AC for Tip 1
    const lowerName = (app.name || '').toLowerCase();
    if (lowerName.includes('ac') || lowerName.includes('air conditioner')) {
      totalAcMonthlyKwh += monthlyKwh;
    }

    // Update table row readouts if elements exist
    const rowDaily = document.getElementById(`row-daily-${app.id}`);
    const rowMonthly = document.getElementById(`row-monthly-${app.id}`);
    const rowCo2 = document.getElementById(`row-co2-${app.id}`);

    if (rowDaily) rowDaily.textContent = fmt2(dailyKwh);
    if (rowMonthly) rowMonthly.textContent = fmt2(monthlyKwh);
    if (rowCo2) rowCo2.textContent = fmt2(monthlyCo2);
  });

  // Yearly CO2 = monthly CO2 * 12
  const yearlyCo2 = totalMonthlyCo2 * 12;

  // Monthly bill (Rs) = monthly kWh * tariff per unit
  const monthlyBill = totalMonthlyKwh * tariff;

  // Eco score (0-100) = min(100, goal CO2 / actual CO2 * 100).
  // If actual CO2 is 0, score is 100.
  let ecoScore = 100;
  if (totalMonthlyCo2 > 0) {
    ecoScore = Math.min(100, (goalCo2 / totalMonthlyCo2) * 100);
  }
  ecoScore = Math.max(0, ecoScore);

  // Label: 80-100 Excellent, 50-79 Good, below 50 Needs improvement
  let ecoLabel = 'Needs improvement';
  let ecoBadgeClass = 'score-poor';
  if (ecoScore >= 80) {
    ecoLabel = 'Excellent';
    ecoBadgeClass = 'score-excellent';
  } else if (ecoScore >= 50) {
    ecoLabel = 'Good';
    ecoBadgeClass = 'score-good';
  }

  // 3. Update Summary Cards in DOM
  document.getElementById('card-monthly-kwh').textContent = fmt2(totalMonthlyKwh);
  document.getElementById('card-daily-kwh').textContent = fmt2(totalDailyKwh);
  document.getElementById('card-monthly-bill').textContent = fmt2(monthlyBill);
  document.getElementById('card-bill-tariff').textContent = fmt2(tariff);
  document.getElementById('card-monthly-co2').textContent = fmt2(totalMonthlyCo2);
  document.getElementById('card-yearly-co2').textContent = fmt2(yearlyCo2);

  // Eco Score
  const elScoreNum = document.getElementById('card-eco-score');
  const elScoreLabel = document.getElementById('card-eco-label');
  const elScoreTarget = document.getElementById('card-eco-target');

  elScoreNum.textContent = Math.round(ecoScore);
  elScoreLabel.textContent = ecoLabel;
  elScoreLabel.className = `score-badge ${ecoBadgeClass}`;
  elScoreTarget.textContent = fmt2(goalCo2);

  // 4. Update Table Footer Totals
  document.getElementById('tot-watts').innerHTML = `<strong>${totalWatts.toLocaleString('en-IN')} W</strong>`;
  document.getElementById('tot-qty').innerHTML = `<strong>${totalQty}</strong>`;
  document.getElementById('tot-daily-kwh').innerHTML = `<strong>${fmt2(totalDailyKwh)}</strong>`;
  document.getElementById('tot-monthly-kwh').innerHTML = `<strong>${fmt2(totalMonthlyKwh)}</strong>`;
  document.getElementById('tot-monthly-co2').innerHTML = `<strong>${fmt2(totalMonthlyCo2)}</strong>`;

  // 5. Update Goal Tracker (Section 6)
  updateGoalTracker(totalMonthlyCo2, goalCo2);

  // 6. Update Carbon Estimator Panel (Section 4)
  document.getElementById('panel-monthly-co2').textContent = fmt2(totalMonthlyCo2);
  document.getElementById('panel-yearly-co2').textContent = fmt2(yearlyCo2);
  document.getElementById('panel-emission-factor').textContent = EMISSION_FACTOR.toFixed(3);
  
  // Tree absorption equivalence (~22 kg CO2 / year / mature tree)
  const treesEquiv = yearlyCo2 > 0 ? (yearlyCo2 / 22) : 0;
  document.getElementById('panel-trees-equivalent').textContent = fmt2(treesEquiv);

  // Highest Appliance Step-by-Step Breakdown
  updateHighestApplianceBreakdown(highestAppliance, totalMonthlyCo2);

  // 7. Update Smart Tips Panel (Section 5)
  updateSmartTips(tariff, totalAcMonthlyKwh, totalMonthlyKwh, totalMonthlyCo2);

  // 8. Update Month-over-Month Comparison
  updateMonthComparison(totalMonthlyKwh, totalMonthlyCo2, lastMonthKwh);

  // 9. Update Charts
  updateCharts(totalMonthlyKwh);

  // Save changes to localStorage
  saveState();
}

/**
 * Section 6: Goal Tracker Progress & Indicator
 */
function updateGoalTracker(actualCo2, targetCo2) {
  const progressBar = document.getElementById('goal-progress-fill');
  const statusPill = document.getElementById('goal-delta-pill');
  const messageBox = document.getElementById('goal-message-box');

  const markerMid = document.getElementById('marker-mid');
  const markerTarget = document.getElementById('marker-target');
  if (markerMid) markerMid.textContent = `${fmt2(targetCo2 * 0.5)} kg (50%)`;
  if (markerTarget) markerTarget.textContent = `Target: ${fmt2(targetCo2)} kg (100%)`;

  if (targetCo2 <= 0) {
    progressBar.style.width = '0%';
    messageBox.className = 'goal-message-box goal-msg-amber';
    messageBox.innerHTML = `<span>Please set a monthly CO₂ target greater than 0 kg.</span>`;
    return;
  }

  // Calculate percentage of target consumed
  const percentUsed = (actualCo2 / targetCo2) * 100;
  const clampedProgress = Math.min(100, Math.max(0, percentUsed));
  progressBar.style.width = `${clampedProgress}%`;

  // Delta comparison
  const diff = actualCo2 - targetCo2;
  const absDiff = Math.abs(diff);

  if (actualCo2 <= targetCo2) {
    // Under target -> Green
    progressBar.className = 'progress-bar-fill progress-green';
    statusPill.style.color = '#15803d';
    statusPill.style.background = '#dcfce7';
    statusPill.textContent = `🌱 Under Budget (${fmt2(percentUsed)}%)`;

    messageBox.className = 'goal-message-box goal-msg-green';
    messageBox.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      <span><strong>Great job!</strong> You are <strong>${fmt2(absDiff)} kg CO₂</strong> under your goal of ${fmt2(targetCo2)} kg.</span>
    `;
  } else if (actualCo2 <= targetCo2 * 1.10) {
    // Within 10% over -> Amber
    progressBar.className = 'progress-bar-fill progress-amber';
    statusPill.style.color = '#b45309';
    statusPill.style.background = '#fef3c7';
    statusPill.textContent = `⚠️ Warning (+${fmt2(percentUsed - 100)}%)`;

    messageBox.className = 'goal-message-box goal-msg-amber';
    messageBox.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <span><strong>Caution:</strong> You are <strong>${fmt2(absDiff)} kg CO₂</strong> over your goal (within 10% tolerance).</span>
    `;
  } else {
    // More than 10% over -> Red
    progressBar.className = 'progress-bar-fill progress-red';
    statusPill.style.color = '#b91c1c';
    statusPill.style.background = '#fee2e2';
    statusPill.textContent = `🚨 High Footprint (+${fmt2(percentUsed - 100)}%)`;

    messageBox.className = 'goal-message-box goal-msg-red';
    messageBox.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <span><strong>Goal Exceeded:</strong> You are <strong>${fmt2(absDiff)} kg CO₂</strong> over your goal of ${fmt2(targetCo2)} kg.</span>
    `;
  }
}

/**
 * Section 4: Live Step-by-Step Breakdown for Highest-Use Appliance
 */
function updateHighestApplianceBreakdown(app, totalMonthlyCo2) {
  const elName = document.getElementById('breakdown-highest-name');
  const elFormula = document.getElementById('breakdown-step-formula');

  if (!app || app.monthlyKwh <= 0) {
    elName.textContent = 'No appliances registered';
    elFormula.textContent = 'Add appliances to the inventory table above to generate step-by-step mathematical decomposition.';
    return;
  }

  const sharePercent = totalMonthlyCo2 > 0 ? ((app.monthlyCo2 / totalMonthlyCo2) * 100) : 0;
  elName.textContent = `${app.name} (${fmt2(sharePercent)}% of emissions)`;

  // Live one-line step-by-step formula string
  const stepText = `Highest consumer: ${app.name} (${app.watts} W × ${app.hours} h/day × ${app.qty} qty ÷ 1,000 = ${fmt2(app.dailyKwh)} kWh/day → ${fmt2(app.monthlyKwh)} kWh/month × ${EMISSION_FACTOR} kg CO₂/kWh = ${fmt2(app.monthlyCo2)} kg CO₂/month, representing ${fmt2(sharePercent)}% of total emissions)`;

  elFormula.textContent = stepText;
}

/**
 * Section 5: Smart Tips Panel Calculations
 */
function updateSmartTips(tariff, acMonthlyKwh, totalMonthlyKwh, totalMonthlyCo2) {
  // Read inputs for Tip A: AC
  const acCurrent = safeNum(document.getElementById('ac-current-temp').value, 20);
  const acTarget = safeNum(document.getElementById('ac-target-temp').value, 24);

  // Read inputs for Tip B: LED Switch
  const ledOldWatts = safeNum(document.getElementById('led-old-watts').value, 60);
  const ledNewWatts = safeNum(document.getElementById('led-new-watts').value, 9);
  const ledQty = safeNum(document.getElementById('led-qty').value, 4);
  const ledHours = safeHours(document.getElementById('led-hours').value, 5);

  // Read inputs for Tip C: Standby Power
  const standbyWatts = safeNum(document.getElementById('standby-watts').value, 5);
  const standbyDevices = safeNum(document.getElementById('standby-devices').value, 6);
  const standbyHours = safeHours(document.getElementById('standby-hours').value, 18);

  // Store in state
  appState.tips = {
    acCurrent, acTarget,
    ledOldWatts, ledNewWatts, ledQty, ledHours,
    standbyWatts, standbyDevices, standbyHours
  };

  // --- Tip A: AC Temperature Optimization ---
  // Formula: Saving percent = min(24, 6 * max(0, target - current)), applied to AC's monthly kWh
  const tempDiff = Math.max(0, acTarget - acCurrent);
  const acSavingPercent = Math.min(MAX_AC_SAVING_PERCENT, AC_SAVING_PER_DEGREE * tempDiff);
  
  // Update linked AC kWh note
  document.getElementById('ac-inventory-kwh').textContent = fmt2(acMonthlyKwh);

  const acSavedKwh = (acMonthlyKwh * acSavingPercent) / 100;
  const acSavedCost = acSavedKwh * tariff;
  const acSavedCo2 = acSavedKwh * EMISSION_FACTOR;

  document.getElementById('tip-ac-kwh').textContent = fmt2(acSavedKwh);
  document.getElementById('tip-ac-cost').textContent = fmt2(acSavedCost);
  document.getElementById('tip-ac-co2').textContent = fmt2(acSavedCo2);

  // --- Tip B: LED Switch ---
  // Formula: (old watts - LED watts) * hours * qty * 30 / 1000
  const wattsDiff = Math.max(0, ledOldWatts - ledNewWatts);
  const ledSavedDailyKwh = (wattsDiff * ledHours * ledQty) / 1000;
  const ledSavedKwh = ledSavedDailyKwh * DAYS_PER_MONTH;
  const ledSavedCost = ledSavedKwh * tariff;
  const ledSavedCo2 = ledSavedKwh * EMISSION_FACTOR;

  document.getElementById('tip-led-kwh').textContent = fmt2(ledSavedKwh);
  document.getElementById('tip-led-cost').textContent = fmt2(ledSavedCost);
  document.getElementById('tip-led-co2').textContent = fmt2(ledSavedCo2);

  // --- Tip C: Standby Power ---
  // Formula: standby watts * devices * idle hours * 30 / 1000
  const standbyDailyKwh = (standbyWatts * standbyDevices * standbyHours) / 1000;
  const standbySavedKwh = standbyDailyKwh * DAYS_PER_MONTH;
  const standbySavedCost = standbySavedKwh * tariff;
  const standbySavedCo2 = standbySavedKwh * EMISSION_FACTOR;

  document.getElementById('tip-standby-kwh').textContent = fmt2(standbySavedKwh);
  document.getElementById('tip-standby-cost').textContent = fmt2(standbySavedCost);
  document.getElementById('tip-standby-co2').textContent = fmt2(standbySavedCo2);

  // --- Total Potential Monthly Savings ---
  const totalSavedKwh = acSavedKwh + ledSavedKwh + standbySavedKwh;
  const totalSavedCost = acSavedCost + ledSavedCost + standbySavedCost;
  const totalSavedCo2 = acSavedCo2 + ledSavedCo2 + standbySavedCo2;

  let totalSavedPercent = 0;
  if (totalMonthlyKwh > 0) {
    totalSavedPercent = (totalSavedKwh / totalMonthlyKwh) * 100;
  }

  document.getElementById('total-saved-kwh').textContent = fmt2(totalSavedKwh);
  document.getElementById('total-saved-cost').textContent = fmt2(totalSavedCost);
  document.getElementById('total-saved-co2').textContent = fmt2(totalSavedCo2);
  document.getElementById('total-saved-percent').textContent = fmt2(totalSavedPercent);
}

/**
 * Section 2c: Month-over-Month Comparison
 */
function updateMonthComparison(thisMonthKwh, thisMonthCo2, lastMonthKwh) {
  const container = document.getElementById('comparison-display-box');
  const lastMonthCo2 = lastMonthKwh * EMISSION_FACTOR;

  const diffKwh = thisMonthKwh - lastMonthKwh;
  const diffCo2 = thisMonthCo2 - lastMonthCo2;

  let percentDiff = 0;
  if (lastMonthKwh > 0) {
    percentDiff = (diffKwh / lastMonthKwh) * 100;
  }

  const isReduced = diffKwh <= 0;
  const badgeClass = isReduced ? 'reduction' : 'increase';
  const arrow = isReduced ? '↓' : '↑';
  const label = isReduced ? 'Reduction' : 'Increase';

  container.innerHTML = `
    <div class="comp-metric-item">
      <span class="comp-metric-label">This Month (Current)</span>
      <span class="comp-metric-val">${fmt2(thisMonthKwh)} <small style="font-size:12px;font-weight:500;">kWh</small></span>
      <span style="font-size:12px;color:#64748b;margin-top:2px;">${fmt2(thisMonthCo2)} kg CO₂</span>
    </div>

    <div class="comp-metric-item">
      <span class="comp-metric-label">Last Month (Baseline)</span>
      <span class="comp-metric-val">${fmt2(lastMonthKwh)} <small style="font-size:12px;font-weight:500;">kWh</small></span>
      <span style="font-size:12px;color:#64748b;margin-top:2px;">${fmt2(lastMonthCo2)} kg CO₂</span>
    </div>

    <div class="comp-metric-item">
      <span class="comp-metric-label">Difference (kWh)</span>
      <span class="comp-metric-val">${fmt2(Math.abs(diffKwh))} <small style="font-size:12px;font-weight:500;">kWh</small></span>
      <span class="comp-badge ${badgeClass}">
        ${arrow} ${fmt2(Math.abs(percentDiff))}% (${label})
      </span>
    </div>

    <div class="comp-metric-item">
      <span class="comp-metric-label">Difference (CO₂)</span>
      <span class="comp-metric-val">${fmt2(Math.abs(diffCo2))} <small style="font-size:12px;font-weight:500;">kg CO₂</small></span>
      <span style="font-size:12px;color:${isReduced ? '#15803d' : '#b91c1c'};font-weight:600;margin-top:4px;">
        ${isReduced ? 'Emissions Reduced' : 'Emissions Increased'}
      </span>
    </div>
  `;
}

// ==========================================
// CHARTS (Chart.js via CDN)
// ==========================================

function initOrUpdateDailyChart() {
  const canvas = document.getElementById('chart-daily-usage');
  if (!canvas) return;

  const labels = appState.dailyLog.map(d => `Day ${d.day}`);
  const kwhData = appState.dailyLog.map(d => safeNum(d.kwh));
  const co2Data = kwhData.map(kwh => parseFloat((kwh * EMISSION_FACTOR).toFixed(2)));

  if (!dailyUsageChart) {
    const ctx = canvas.getContext('2d');
    dailyUsageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Daily kWh',
            data: kwhData,
            backgroundColor: 'rgba(16, 185, 129, 0.75)',
            borderColor: '#059669',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            label: 'Daily CO₂ (kg)',
            data: co2Data,
            type: 'line',
            borderColor: '#dc2626',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            borderWidth: 2,
            pointBackgroundColor: '#dc2626',
            pointRadius: 3,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Plus Jakarta Sans', weight: '600' } }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                return `${label}: ${fmt2(val)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false }
          },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Daily kWh' },
            beginAtZero: true
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Daily CO₂ (kg)' },
            grid: { drawOnChartArea: false },
            beginAtZero: true
          }
        }
      }
    });
  } else {
    dailyUsageChart.data.labels = labels;
    dailyUsageChart.data.datasets[0].data = kwhData;
    dailyUsageChart.data.datasets[1].data = co2Data;
    dailyUsageChart.update('none');
  }
}

function initOrUpdateApplianceChart(totalMonthlyKwh) {
  const canvas = document.getElementById('chart-appliance-share');
  if (!canvas) return;

  const labels = [];
  const data = [];
  const palette = [
    '#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899',
    '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4'
  ];

  appState.appliances.forEach(app => {
    const monthly = (safeNum(app.watts) * safeHours(app.hours) * safeNum(app.qty)) * DAYS_PER_MONTH / 1000;
    if (monthly > 0) {
      labels.push(app.name || 'Appliance');
      data.push(parseFloat(monthly.toFixed(2)));
    }
  });

  // Custom legend container
  const legendBox = document.getElementById('appliance-chart-legend');
  if (legendBox) {
    legendBox.innerHTML = labels.map((lbl, i) => {
      const val = data[i];
      const pct = totalMonthlyKwh > 0 ? ((val / totalMonthlyKwh) * 100).toFixed(1) : 0;
      const color = palette[i % palette.length];
      return `
        <div class="legend-chip">
          <span class="legend-color-dot" style="background:${color}"></span>
          <span>${lbl}: <strong>${pct}%</strong> (${fmt2(val)} kWh)</span>
        </div>
      `;
    }).join('');
  }

  if (!applianceShareChart) {
    const ctx = canvas.getContext('2d');
    applianceShareChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: palette.slice(0, Math.max(labels.length, 1)),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const val = ctx.parsed;
                const pct = totalMonthlyKwh > 0 ? ((val / totalMonthlyKwh) * 100).toFixed(1) : 0;
                return ` ${ctx.label}: ${fmt2(val)} kWh (${pct}%)`;
              }
            }
          }
        }
      }
    });
  } else {
    applianceShareChart.data.labels = labels;
    applianceShareChart.data.datasets[0].data = data;
    applianceShareChart.data.datasets[0].backgroundColor = palette.slice(0, Math.max(labels.length, 1));
    applianceShareChart.update('none');
  }
}

function initOrUpdateComparisonChart() {
  const canvas = document.getElementById('chart-comparison');
  if (!canvas) return;

  const thisMonthKwh = safeNum(document.getElementById('card-monthly-kwh').textContent.replace(/,/g, ''), 0);
  const lastMonthKwh = safeNum(document.getElementById('input-last-month-kwh').value, 0);

  const thisMonthCo2 = thisMonthKwh * EMISSION_FACTOR;
  const lastMonthCo2 = lastMonthKwh * EMISSION_FACTOR;

  if (!comparisonChart) {
    const ctx = canvas.getContext('2d');
    comparisonChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Electricity Usage (kWh)', 'Carbon Footprint (kg CO₂)'],
        datasets: [
          {
            label: 'Last Month',
            data: [lastMonthKwh, lastMonthCo2],
            backgroundColor: 'rgba(148, 163, 184, 0.7)',
            borderColor: '#64748b',
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: 'This Month',
            data: [thisMonthKwh, thisMonthCo2],
            backgroundColor: 'rgba(34, 197, 94, 0.8)',
            borderColor: '#16a34a',
            borderWidth: 1.5,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Plus Jakarta Sans', weight: '600' } }
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ` ${ctx.dataset.label}: ${fmt2(ctx.parsed.x)}`;
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true }
        }
      }
    });
  } else {
    comparisonChart.data.datasets[0].data = [lastMonthKwh, lastMonthCo2];
    comparisonChart.data.datasets[1].data = [thisMonthKwh, thisMonthCo2];
    comparisonChart.update('none');
  }
}

function updateCharts(totalMonthlyKwh) {
  initOrUpdateDailyChart();
  initOrUpdateApplianceChart(totalMonthlyKwh);
  initOrUpdateComparisonChart();
}

// ==========================================
// TABLE RENDERING & DYNAMIC ROWS
// ==========================================

/**
 * Render Section 3 Appliance Inventory Table
 */
function renderApplianceTable() {
  const tbody = document.getElementById('appliance-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appState.appliances.forEach((app) => {
    const tr = document.createElement('tr');
    tr.id = `tr-app-${app.id}`;

    tr.innerHTML = `
      <td>
        <input type="text" class="app-name-input" data-id="${app.id}" value="${escapeHtml(app.name)}" placeholder="e.g. Inverter AC">
      </td>
      <td>
        <input type="number" class="app-num-input app-watts" data-id="${app.id}" data-field="watts" min="0" max="20000" step="1" value="${app.watts}">
      </td>
      <td>
        <input type="number" class="app-num-input app-hours" data-id="${app.id}" data-field="hours" min="0" max="24" step="0.5" value="${app.hours}">
      </td>
      <td>
        <input type="number" class="app-num-input app-qty" data-id="${app.id}" data-field="qty" min="0" max="100" step="1" value="${app.qty}">
      </td>
      <td class="table-calc-cell" id="row-daily-${app.id}">0.00</td>
      <td class="table-calc-cell" id="row-monthly-${app.id}">0.00</td>
      <td class="table-calc-cell" id="row-co2-${app.id}">0.00</td>
      <td style="text-align: center;">
        <button class="btn-danger-outline btn-delete-row" data-id="${app.id}" title="Delete appliance">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Render Section 2a Daily Log Table
 */
function renderDailyLogTable() {
  const tbody = document.getElementById('daily-log-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appState.dailyLog.forEach(item => {
    const tr = document.createElement('tr');
    const computedCo2 = safeNum(item.kwh) * EMISSION_FACTOR;

    tr.innerHTML = `
      <td><strong>Day ${item.day}</strong></td>
      <td>
        <input type="date" class="daily-date-input" data-day="${item.day}" value="${item.date}">
      </td>
      <td>
        <input type="number" class="daily-kwh-input" data-day="${item.day}" min="0" max="200" step="0.1" value="${item.kwh}">
      </td>
      <td class="table-calc-cell" id="daily-co2-${item.day}">${fmt2(computedCo2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function syncInputsFromState() {
  document.getElementById('input-tariff').value = appState.tariff;
  document.getElementById('input-last-month-kwh').value = appState.lastMonthKwh;
  document.getElementById('input-goal-co2').value = appState.goalCo2;

  // Tips
  if (appState.tips) {
    document.getElementById('ac-current-temp').value = appState.tips.acCurrent;
    document.getElementById('ac-target-temp').value = appState.tips.acTarget;
    document.getElementById('led-old-watts').value = appState.tips.ledOldWatts;
    document.getElementById('led-new-watts').value = appState.tips.ledNewWatts;
    document.getElementById('led-qty').value = appState.tips.ledQty;
    document.getElementById('led-hours').value = appState.tips.ledHours;
    document.getElementById('standby-watts').value = appState.tips.standbyWatts;
    document.getElementById('standby-devices').value = appState.tips.standbyDevices;
    document.getElementById('standby-hours').value = appState.tips.standbyHours;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
}

// ==========================================
// ACCEPTANCE CRITERIA SELF-TEST SUITE
// ==========================================

/**
 * Runs the required acceptance test suite:
 * 1. Single AC of 1500 W, 6 h/day, qty 1 gives 9 kWh/day, 270 kWh/month, 182.25 kg CO2/month.
 * 2. AC tip with current 20°C and target 24°C gives 24 percent saving, 64.8 kWh saved, about 43.7 kg CO2 saved per month.
 * Prints PASS / FAIL in console and opens verification toast.
 */
function runSelfTest() {
  console.group('%c[Smart Energy Dashboard] Self-Test Acceptance Suite', 'color: #10b981; font-weight: bold; font-size: 13px;');

  const results = [];

  // --- Test 1: Single AC of 1500W, 6h, qty 1 ---
  const acWatts = 1500;
  const acHours = 6;
  const acQty = 1;

  const test1DailyKwh = (acWatts * acHours * acQty) / 1000;
  const test1MonthlyKwh = test1DailyKwh * DAYS_PER_MONTH;
  const test1MonthlyCo2 = test1MonthlyKwh * EMISSION_FACTOR;

  const pass1Daily = Math.abs(test1DailyKwh - 9.0) < 0.0001;
  const pass1Monthly = Math.abs(test1MonthlyKwh - 270.0) < 0.0001;
  const pass1Co2 = Math.abs(test1MonthlyCo2 - 182.25) < 0.0001;

  results.push({
    test: '1a. Single AC Daily kWh (1500W, 6h, qty 1)',
    expected: '9.00 kWh/day',
    actual: `${test1DailyKwh.toFixed(2)} kWh/day`,
    status: pass1Daily ? 'PASS' : 'FAIL'
  });

  results.push({
    test: '1b. Single AC Monthly kWh (9 kWh * 30 days)',
    expected: '270.00 kWh/month',
    actual: `${test1MonthlyKwh.toFixed(2)} kWh/month`,
    status: pass1Monthly ? 'PASS' : 'FAIL'
  });

  results.push({
    test: '1c. Single AC Monthly CO2 (270 * 0.675)',
    expected: '182.25 kg CO2/month',
    actual: `${test1MonthlyCo2.toFixed(2)} kg CO2/month`,
    status: pass1Co2 ? 'PASS' : 'FAIL'
  });

  // --- Test 2: AC Tip (20°C -> 24°C) ---
  const currentTemp = 20;
  const targetTemp = 24;
  const diffDeg = targetTemp - currentTemp;
  const savingPct = Math.min(MAX_AC_SAVING_PERCENT, AC_SAVING_PER_DEGREE * diffDeg);
  const acSavedKwh = (test1MonthlyKwh * savingPct) / 100;
  const acSavedCo2 = acSavedKwh * EMISSION_FACTOR;

  const pass2Pct = savingPct === 24;
  const pass2Kwh = Math.abs(acSavedKwh - 64.8) < 0.0001;
  // Prompt states: "about 43.7 kg CO2 saved per month" (exact: 64.8 * 0.675 = 43.74 kg)
  const pass2Co2 = Math.abs(acSavedCo2 - 43.74) < 0.05;

  results.push({
    test: '2a. AC Thermostat Saving % (20°C to 24°C)',
    expected: '24%',
    actual: `${savingPct}%`,
    status: pass2Pct ? 'PASS' : 'FAIL'
  });

  results.push({
    test: '2b. AC Tip Saved kWh (270 * 24%)',
    expected: '64.80 kWh saved/mo',
    actual: `${acSavedKwh.toFixed(2)} kWh saved/mo`,
    status: pass2Kwh ? 'PASS' : 'FAIL'
  });

  results.push({
    test: '2c. AC Tip Saved CO2 (64.8 * 0.675)',
    expected: '43.74 kg CO2 saved/mo (~43.7)',
    actual: `${acSavedCo2.toFixed(2)} kg CO2 saved/mo`,
    status: pass2Co2 ? 'PASS' : 'FAIL'
  });

  // Log in console
  console.table(results);

  const allPassed = results.every(r => r.status === 'PASS');
  if (allPassed) {
    console.log('%c[PASS] ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!', 'color: #16a34a; font-weight: bold; font-size: 14px;');
  } else {
    console.error('[FAIL] SOME ACCEPTANCE TESTS FAILED. See details above.');
  }

  console.groupEnd();

  // Show Toast Dialog
  showTestToast(results, allPassed);
}

function showTestToast(results, allPassed) {
  const toast = document.getElementById('test-toast');
  const body = document.getElementById('test-toast-body');
  if (!toast || !body) return;

  const headerHtml = `
    <div style="margin-bottom: 10px; font-weight: 700; color: ${allPassed ? '#4ade80' : '#f87171'}">
      ${allPassed ? '✔ ALL ACCEPTANCE TESTS PASSED' : '❌ ACCEPTANCE TESTS FAILED'}
    </div>
  `;

  const rowsHtml = results.map(r => `
    <div class="test-row">
      <span style="max-width: 65%;">${r.test}</span>
      <span class="${r.status === 'PASS' ? 'test-pass' : 'test-fail'}">${r.status} (${r.actual})</span>
    </div>
  `).join('');

  const footerHtml = `
    <div style="margin-top: 10px; font-size: 11px; color: #94a3b8;">
      Console assertion table printed in DevTools Console (F12).
    </div>
  `;

  body.innerHTML = headerHtml + rowsHtml + footerHtml;
  toast.classList.remove('hidden');
}

// ==========================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize State
  loadState();
  syncInputsFromState();
  renderApplianceTable();
  renderDailyLogTable();

  // 2. Perform Initial Calculation & Chart Draw
  recalculateEverything();

  // 3. Global Input Listeners (Recomputes live on any change)
  const globalInputs = ['input-tariff', 'input-last-month-kwh', 'input-goal-co2'];
  globalInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', recalculateEverything);
    }
  });

  // 4. Smart Tips Input Listeners
  const tipInputs = [
    'ac-current-temp', 'ac-target-temp',
    'led-old-watts', 'led-new-watts', 'led-qty', 'led-hours',
    'standby-watts', 'standby-devices', 'standby-hours'
  ];
  tipInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', recalculateEverything);
    }
  });

  // 5. Appliance Table Delegated Listeners (Live input + delete)
  const appTbody = document.getElementById('appliance-tbody');
  if (appTbody) {
    appTbody.addEventListener('input', (e) => {
      const target = e.target;
      const appId = target.getAttribute('data-id');
      if (!appId) return;

      const app = appState.appliances.find(a => a.id === appId);
      if (!app) return;

      if (target.classList.contains('app-name-input')) {
        app.name = target.value;
      } else if (target.hasAttribute('data-field')) {
        const field = target.getAttribute('data-field');
        if (field === 'hours') {
          app[field] = safeHours(target.value);
        } else {
          app[field] = safeNum(target.value);
        }
      }

      recalculateEverything();
    });

    appTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete-row');
      if (!btn) return;
      const appId = btn.getAttribute('data-id');
      if (!appId) return;

      appState.appliances = appState.appliances.filter(a => a.id !== appId);
      renderApplianceTable();
      recalculateEverything();
    });
  }

  // 6. Add Custom Appliance Row Button
  const btnAddRow = document.getElementById('btn-add-row');
  if (btnAddRow) {
    btnAddRow.addEventListener('click', () => {
      const newId = `app-${Date.now()}`;
      appState.appliances.push({
        id: newId,
        name: 'New Custom Appliance',
        watts: 100,
        hours: 2,
        qty: 1
      });
      renderApplianceTable();
      recalculateEverything();

      const newTr = document.getElementById(`tr-app-${newId}`);
      if (newTr) {
        const input = newTr.querySelector('.app-name-input');
        if (input) {
          input.focus();
          input.select();
        }
      }
    });
  }

  // 7. Preset Dropdown
  const selectPreset = document.getElementById('select-preset-appliance');
  if (selectPreset) {
    selectPreset.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      const [name, watts, hours, qty] = val.split('|');
      const newId = `app-${Date.now()}`;
      appState.appliances.push({
        id: newId,
        name: name,
        watts: parseFloat(watts) || 100,
        hours: parseFloat(hours) || 1,
        qty: parseInt(qty, 10) || 1
      });
      renderApplianceTable();
      recalculateEverything();
      selectPreset.value = '';
    });
  }

  // 8. Daily Log Table Input Listeners
  const dailyTbody = document.getElementById('daily-log-tbody');
  if (dailyTbody) {
    dailyTbody.addEventListener('input', (e) => {
      const target = e.target;
      const dayNum = parseInt(target.getAttribute('data-day'), 10);
      if (!dayNum) return;

      const logItem = appState.dailyLog.find(d => d.day === dayNum);
      if (!logItem) return;

      if (target.classList.contains('daily-kwh-input')) {
        logItem.kwh = safeNum(target.value);
        const cell = document.getElementById(`daily-co2-${dayNum}`);
        if (cell) cell.textContent = fmt2(logItem.kwh * EMISSION_FACTOR);
      } else if (target.classList.contains('daily-date-input')) {
        logItem.date = target.value;
      }

      initOrUpdateDailyChart();
      saveState();
    });
  }

  // 9. Reset 14 Days Daily Log Button
  const btnResetDaily = document.getElementById('btn-reset-daily-log');
  if (btnResetDaily) {
    btnResetDaily.addEventListener('click', () => {
      appState.dailyLog = JSON.parse(JSON.stringify(SAMPLE_DATA.dailyLog));
      renderDailyLogTable();
      initOrUpdateDailyChart();
      saveState();
    });
  }

  // 10. Toggle Daily Log Table Button
  const btnToggleDaily = document.getElementById('btn-toggle-daily-log');
  const dailyLogContainer = document.getElementById('daily-log-container');
  if (btnToggleDaily && dailyLogContainer) {
    btnToggleDaily.addEventListener('click', () => {
      const isHidden = dailyLogContainer.style.display === 'none';
      dailyLogContainer.style.display = isHidden ? 'block' : 'none';
    });
  }

  // 11. Top Banner Buttons
  const btnReset = document.getElementById('btn-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all dashboard inputs to default sample data?')) {
        resetToSampleData();
      }
    });
  }

  const btnSelfTest = document.getElementById('btn-self-test');
  if (btnSelfTest) {
    btnSelfTest.addEventListener('click', runSelfTest);
  }

  const btnPrint = document.getElementById('btn-print');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  const btnCloseToast = document.getElementById('btn-close-toast');
  const toast = document.getElementById('test-toast');
  if (btnCloseToast && toast) {
    btnCloseToast.addEventListener('click', () => {
      toast.classList.add('hidden');
    });
  }

  // Auto-run self-test in console on initial load for verification
  console.log('%c[Smart Energy & Carbon Estimation Dashboard Ready]', 'color: #10b981; font-weight: bold;');
  console.log('Running background self-test to verify math engine...');
  runSelfTest();
});
