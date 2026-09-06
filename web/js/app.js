import { TrajectoryChart } from './chart.js?v=20260906-14';
import { dateAtMonth, monthIndexFromValue, projectScenario } from './finance.js?v=20260906-6';
import { loadSavedScenario, saveScenario } from './storage.js?v=20260906-4';

const COLORS = {
  loan: '#d96b4b',
  interest: '#58728a',
  stock: '#137969',
  cash: '#bd8d27'
};
const OVERVIEW_MONTHS = [5 * 12, 10 * 12, 20 * 12];
const PLAYBACK_STEP_MONTHS = 12;
const PLAYBACK_YEAR_DURATION_MS = 450;

const form = document.querySelector('#settings-body');
const settings = document.querySelector('.settings');
const settingsToggle = document.querySelector('#settings-toggle');
const postIncomeField = document.querySelector('#post-income-field');
const chartCanvas = document.querySelector('#trajectory-chart');
const playbackButton = document.querySelector('#playback-toggle');
const playbackDate = document.querySelector('#playback-date');
const overviewButton = document.querySelector('#overview-toggle');
const chart = new TrajectoryChart(
  chartCanvas,
  document.querySelector('#chart-tooltip'),
  document.querySelector('#overview-tooltips'),
  { formatMoney, formatMonth }
);
const PERSISTED_FIELDS = [
  'stockPrincipal',
  'monthlyInvestment',
  'stockAnnualReturn',
  'loanPrincipal',
  'loanAnnualRate',
  'remainingYears',
  'repaymentMethod',
  'initialCash',
  'monthlyIncome',
  'monthlyExpenses',
  'retirementYear',
  'retirementMonthOfYear',
  'retirementIncomeMode',
  'postRetirementIncome'
];

let plan = 'basic';
let scale = 'linear';
let scheduledFrame = null;
let overviewEnabled = false;
let playbackFrame = null;
let playbackPreviousTimestamp = null;
let playbackMonth = null;
let currentProjectionMonths = 30 * 12;
const hiddenSeries = new Set();

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function restoreScenario() {
  const saved = loadSavedScenario(getLocalStorage());
  if (!saved) return;

  PERSISTED_FIELDS.forEach((name) => {
    if (!Object.hasOwn(saved.values, name) || !form.elements[name]) return;
    const field = form.elements[name];
    const savedValue = String(saved.values[name]);
    if (field.type !== 'number') {
      field.value = savedValue;
      return;
    }

    const number = Number(savedValue);
    if (!Number.isFinite(number)) return;
    const minimum = field.min === '' ? -Infinity : Number(field.min);
    const maximum = field.max === '' ? Infinity : Number(field.max);
    field.value = String(Math.min(maximum, Math.max(minimum, number)));
  });

  const legacyRetirementDate = /^(\d{4})-(\d{2})$/.exec(saved.values.retirementDate || '');
  if (!Object.hasOwn(saved.values, 'retirementYear') && legacyRetirementDate) {
    form.elements.retirementYear.value = legacyRetirementDate[1];
    form.elements.retirementMonthOfYear.value = String(Number(legacyRetirementDate[2]));
  }
  plan = saved.plan === 'pro' ? 'pro' : 'basic';
  scale = saved.scale === 'log' ? 'log' : 'linear';
}

function persistScenario() {
  const values = Object.fromEntries(PERSISTED_FIELDS.map((name) => [name, form.elements[name].value]));
  saveScenario(getLocalStorage(), { plan, scale, values });
}

function syncViewState() {
  document.body.dataset.plan = plan;
  document.querySelectorAll('[data-plan-button]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.planButton === plan));
  });
  document.querySelectorAll('[data-scale-button]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.scaleButton === scale));
  });
}

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0
});

function formatMoney(value, axis = false) {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (axis) {
    if (absolute >= 100_000_000) return `${sign}¥${Number((absolute / 100_000_000).toFixed(1))}亿`;
    if (absolute >= 10_000) return `${sign}¥${Math.round(absolute / 10_000)}万`;
    return `${sign}¥${Math.round(absolute)}`;
  }
  if (absolute >= 100_000_000) return `${sign}¥${(absolute / 100_000_000).toFixed(2)}亿`;
  if (absolute >= 10_000) return `${sign}¥${(absolute / 10_000).toFixed(1)}万`;
  return `${sign}${money.format(absolute)}`;
}

function formatMonth(index) {
  const date = dateAtMonth(index);
  return `${date.year}.${String(date.month + 1).padStart(2, '0')}`;
}

function exactMoney(value) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${money.format(Math.abs(value))}`;
}

function formatDuration(months) {
  if (months === 0) return '现在';
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (!years) return `约 ${remainder} 个月后`;
  if (!remainder) return `约 ${years} 年后`;
  return `约 ${years} 年 ${remainder} 个月后`;
}

function formatHorizon(months) {
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder ? `${years} 年 ${remainder} 个月` : `${years} 年`;
}

function signedMoney(value) {
  return `${value >= 0 ? '+' : ''}${exactMoney(value)}`;
}

function fieldNumber(name) {
  const value = Number(form.elements[name].value);
  return Number.isFinite(value) ? value : 0;
}

function retirementMonthFromFields() {
  const year = Math.min(2066, Math.max(2026, Math.round(fieldNumber('retirementYear'))));
  const month = Math.min(12, Math.max(1, Math.round(fieldNumber('retirementMonthOfYear'))));
  const value = `${year}-${String(month).padStart(2, '0')}`;
  return Math.min(40 * 12, monthIndexFromValue(value));
}

function normalizeRetirementFields() {
  const date = dateAtMonth(retirementMonthFromFields());
  form.elements.retirementYear.value = String(date.year);
  form.elements.retirementMonthOfYear.value = String(date.month + 1);
}

function readInputs() {
  const retirementIncomeMode = form.elements.retirementIncomeMode.value;
  return {
    plan,
    loanPrincipal: fieldNumber('loanPrincipal'),
    loanAnnualRate: fieldNumber('loanAnnualRate'),
    repaymentMethod: form.elements.repaymentMethod.value,
    remainingYears: fieldNumber('remainingYears'),
    stockPrincipal: fieldNumber('stockPrincipal'),
    monthlyInvestment: fieldNumber('monthlyInvestment'),
    stockAnnualReturn: fieldNumber('stockAnnualReturn'),
    initialCash: fieldNumber('initialCash'),
    monthlyIncome: fieldNumber('monthlyIncome'),
    monthlyExpenses: fieldNumber('monthlyExpenses'),
    retirementMonth: retirementMonthFromFields(),
    postRetirementIncome: retirementIncomeMode === 'fixed' ? fieldNumber('postRetirementIncome') : 0
  };
}

function renderLegend(series) {
  const legend = document.querySelector('#legend');
  legend.replaceChildren();
  series.forEach((item) => {
    const visible = !hiddenSeries.has(item.key);
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'legend-toggle';
    entry.setAttribute('aria-pressed', String(visible));
    entry.title = `${visible ? '隐藏' : '显示'}${item.label}`;
    const line = document.createElement('i');
    line.style.setProperty('--series-color', item.color);
    line.classList.toggle('is-dashed', Boolean(item.dash));
    entry.append(line, item.label);
    entry.addEventListener('click', () => {
      resetPlayback();
      if (visible) hiddenSeries.add(item.key);
      else hiddenSeries.delete(item.key);
      render();
    });
    legend.append(entry);
  });
}

function render() {
  const result = projectScenario(readInputs());
  const { inputs, summary, points } = result;
  const isPro = plan === 'pro';
  const methodLabel = inputs.repaymentMethod === 'equal-payment' ? '等额本息' : '等额本金';
  const horizonLabel = formatHorizon(summary.projectionMonths);
  const allSeries = [
    { key: 'loan', label: '贷款剩余本金', color: COLORS.loan, tooltipOrder: 2 },
    { key: 'cumulativeInterest', label: '累计利息', color: COLORS.interest, dash: [8, 6], lineWidth: 2.2, tooltipOrder: 3 },
    { key: 'stock', label: '纳指资产', color: COLORS.stock, fill: 'rgba(19, 121, 105, .14)', tooltipOrder: 0 }
  ];
  if (isPro) allSeries.push({ key: 'cash', label: '现金存款', color: COLORS.cash, tooltipOrder: 1 });
  const series = allSeries.filter((item) => !hiddenSeries.has(item.key));
  currentProjectionMonths = summary.projectionMonths;

  document.querySelector('#metric-payment-label').textContent = inputs.repaymentMethod === 'equal-payment' ? '每月还款' : '首月还款';
  document.querySelector('#metric-payment').textContent = exactMoney(summary.firstPayment);
  document.querySelector('#metric-payment-detail').textContent = `${methodLabel} · 首月本金 ${exactMoney(summary.firstPrincipal)} · 利息 ${exactMoney(summary.firstInterest)}`;
  document.querySelector('#metric-interest').textContent = formatMoney(summary.totalInterest);
  document.querySelector('#metric-interest-detail').textContent = `按 ${methodLabel}及当前利率估算`;

  if (isPro) {
    document.querySelector('#metric-event-label').textContent = '现金安全垫';
    document.querySelector('#metric-event').textContent = summary.cashNegativeMonth === null
      ? '保持为正'
      : formatMonth(summary.cashNegativeMonth);
    document.querySelector('#metric-event-detail').textContent = summary.cashNegativeMonth === null
      ? `${horizonLabel}后 ${formatMoney(summary.finalCash)}`
      : `${formatDuration(summary.cashNegativeMonth)}首次转负 · 期末 ${formatMoney(summary.finalCash)}`;
  } else {
    document.querySelector('#metric-event-label').textContent = '资产超过贷款';
    document.querySelector('#metric-event').textContent = summary.crossoverMonth === null
      ? `${horizonLabel}以后`
      : formatMonth(summary.crossoverMonth);
    document.querySelector('#metric-event-detail').textContent = summary.crossoverMonth === null
      ? '当前情景下尚未超过'
      : formatDuration(summary.crossoverMonth);
  }

  document.querySelector('#metric-stock-label').textContent = '30 年后纳指资产';
  document.querySelector('#metric-stock').textContent = formatMoney(summary.finalStock);
  document.querySelector('#metric-stock-detail').textContent = `累计投入 ${formatMoney(summary.investedCapital)}`;
  document.querySelector('#pre-retirement-net').textContent = signedMoney(summary.preRetirementNet);
  document.querySelector('#retirement-summary').textContent = formatMonth(inputs.retirementMonth);
  document.querySelector('#post-retirement-net').textContent = signedMoney(summary.postRetirementNet);
  chartCanvas.setAttribute('aria-label', isPro
    ? `未来 ${horizonLabel}的贷款、累计利息、纳指资产和现金存款曲线`
    : `未来 ${horizonLabel}的贷款、累计利息和纳指资产曲线`);

  renderLegend(allSeries);
  chart.setData({
    points,
    series,
    scale,
    overviewMonths: overviewEnabled ? OVERVIEW_MONTHS : []
  });
}

function updatePlaybackButton(state) {
  playbackButton.dataset.state = state;
  playbackButton.setAttribute('aria-pressed', String(state === 'playing'));
  playbackButton.querySelector('span').textContent = state === 'playing'
    ? '暂停'
    : state === 'paused'
      ? '继续'
      : state === 'complete'
        ? '重播'
        : '播放';
}

function resetPlayback() {
  if (playbackFrame !== null) window.cancelAnimationFrame(playbackFrame);
  playbackFrame = null;
  playbackPreviousTimestamp = null;
  playbackMonth = null;
  playbackDate.hidden = true;
  updatePlaybackButton('idle');
  chart.clearPlayback();
}

function showPlaybackMonth() {
  playbackDate.hidden = false;
  playbackDate.textContent = formatMonth(Math.floor(playbackMonth));
  chart.setPlaybackMonth(playbackMonth);
}

function finishPlayback() {
  if (playbackFrame !== null) window.cancelAnimationFrame(playbackFrame);
  playbackFrame = null;
  playbackPreviousTimestamp = null;
  updatePlaybackButton('complete');
}

function advancePlayback(timestamp) {
  if (playbackMonth >= currentProjectionMonths) {
    finishPlayback();
    return;
  }

  if (playbackPreviousTimestamp === null) playbackPreviousTimestamp = timestamp;
  const elapsed = Math.min(50, timestamp - playbackPreviousTimestamp);
  playbackPreviousTimestamp = timestamp;
  playbackMonth = Math.min(
    currentProjectionMonths,
    playbackMonth + elapsed / PLAYBACK_YEAR_DURATION_MS * PLAYBACK_STEP_MONTHS
  );
  showPlaybackMonth();
  if (playbackMonth >= currentProjectionMonths) {
    finishPlayback();
  } else {
    playbackFrame = window.requestAnimationFrame(advancePlayback);
  }
}

function startPlayback() {
  if (overviewEnabled) {
    overviewEnabled = false;
    overviewButton.setAttribute('aria-pressed', 'false');
    render();
  }
  if (playbackMonth === null || playbackMonth >= currentProjectionMonths) playbackMonth = 0;
  showPlaybackMonth();
  updatePlaybackButton('playing');
  playbackPreviousTimestamp = null;
  playbackFrame = window.requestAnimationFrame(advancePlayback);
}

function pausePlayback() {
  if (playbackFrame !== null) window.cancelAnimationFrame(playbackFrame);
  playbackFrame = null;
  playbackPreviousTimestamp = null;
  updatePlaybackButton('paused');
}

function scheduleRender() {
  if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame);
  scheduledFrame = requestAnimationFrame(() => {
    scheduledFrame = null;
    render();
  });
}

function updateRetirementIncomeField() {
  const usesFixedIncome = form.elements.retirementIncomeMode.value === 'fixed';
  postIncomeField.hidden = !usesFixedIncome;
  form.elements.postRetirementIncome.disabled = !usesFixedIncome;
}

form.addEventListener('input', () => {
  resetPlayback();
  updateRetirementIncomeField();
  persistScenario();
  scheduleRender();
});
form.addEventListener('change', () => {
  resetPlayback();
  normalizeRetirementFields();
  updateRetirementIncomeField();
  persistScenario();
  scheduleRender();
});

document.querySelectorAll('[data-plan-button]').forEach((button) => {
  button.addEventListener('click', () => {
    resetPlayback();
    plan = button.dataset.planButton;
    document.body.dataset.plan = plan;
    document.querySelectorAll('[data-plan-button]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    persistScenario();
    scheduleRender();
  });
});

document.querySelectorAll('[data-scale-button]').forEach((button) => {
  button.addEventListener('click', () => {
    resetPlayback();
    scale = button.dataset.scaleButton;
    document.querySelectorAll('[data-scale-button]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    persistScenario();
    scheduleRender();
  });
});

playbackButton.addEventListener('click', () => {
  if (playbackFrame !== null) pausePlayback();
  else startPlayback();
});

overviewButton.addEventListener('click', () => {
  overviewEnabled = !overviewEnabled;
  resetPlayback();
  overviewButton.setAttribute('aria-pressed', String(overviewEnabled));
  render();
});

settingsToggle.addEventListener('click', () => {
  const collapsed = settings.dataset.collapsed === 'true';
  settings.dataset.collapsed = String(!collapsed);
  settingsToggle.setAttribute('aria-expanded', String(collapsed));
  settingsToggle.querySelector('span').textContent = collapsed ? '收起' : '展开';
});

restoreScenario();
normalizeRetirementFields();
syncViewState();
updateRetirementIncomeField();
render();
