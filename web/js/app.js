import { TrajectoryChart } from './chart.js';
import { dateAtMonth, monthIndexFromValue, projectScenario } from './finance.js';

const COLORS = {
  loan: '#d96b4b',
  stock: '#137969',
  cash: '#bd8d27'
};

const form = document.querySelector('#settings-body');
const settings = document.querySelector('.settings');
const settingsToggle = document.querySelector('#settings-toggle');
const postIncomeField = document.querySelector('#post-income-field');
const chartCanvas = document.querySelector('#trajectory-chart');
const chart = new TrajectoryChart(chartCanvas, document.querySelector('#chart-tooltip'), {
  formatMoney,
  formatMonth
});

let plan = 'basic';
let scale = 'linear';
let scheduledFrame = null;

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

function signedMoney(value) {
  return `${value >= 0 ? '+' : ''}${exactMoney(value)}`;
}

function fieldNumber(name) {
  const value = Number(form.elements[name].value);
  return Number.isFinite(value) ? value : 0;
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
    retirementMonth: monthIndexFromValue(form.elements.retirementDate.value),
    postRetirementIncome: retirementIncomeMode === 'fixed' ? fieldNumber('postRetirementIncome') : 0
  };
}

function renderLegend(series) {
  const legend = document.querySelector('#legend');
  legend.replaceChildren();
  series.forEach((item) => {
    const entry = document.createElement('span');
    const line = document.createElement('i');
    line.style.setProperty('--series-color', item.color);
    entry.append(line, item.label);
    legend.append(entry);
  });
}

function render() {
  const result = projectScenario(readInputs());
  const { inputs, summary, points } = result;
  const isPro = plan === 'pro';
  const methodLabel = inputs.repaymentMethod === 'equal-payment' ? '等额本息' : '等额本金';
  const series = [
    { key: 'loan', label: '贷款剩余本金', color: COLORS.loan },
    { key: 'stock', label: '纳斯达克 100 资产', color: COLORS.stock, fill: 'rgba(19, 121, 105, .14)' }
  ];
  if (isPro) series.push({ key: 'cash', label: '现金存款', color: COLORS.cash });

  document.querySelector('#result-title').textContent = isPro ? '家庭现金流与退休' : '贷款与投资';
  document.querySelector('#result-subtitle').textContent = isPro
    ? '现金流版将收入、开支、房贷和定投汇总到现金余额，并在退休时切换收入。'
    : '基础版计入初始仓位和每月定投，不计算家庭现金余额。';

  document.querySelector('#metric-loan').textContent = formatMoney(inputs.loanPrincipal);
  document.querySelector('#metric-loan-detail').textContent = summary.payoffMonth === null
    ? inputs.loanPrincipal === 0 ? '当前无贷款' : '30 年内尚未结清'
    : `预计 ${formatMonth(summary.payoffMonth)} 结清`;
  document.querySelector('#metric-payment-label').textContent = inputs.repaymentMethod === 'equal-payment' ? '每月还款' : '首月还款';
  document.querySelector('#metric-payment').textContent = exactMoney(summary.firstPayment);
  document.querySelector('#metric-payment-detail').textContent = `${methodLabel} · 首月本金 ${exactMoney(summary.firstPrincipal)} · 利息 ${exactMoney(summary.firstInterest)}`;

  if (isPro) {
    document.querySelector('#metric-event-label').textContent = '现金安全垫';
    document.querySelector('#metric-event').textContent = summary.cashNegativeMonth === null
      ? '保持为正'
      : formatMonth(summary.cashNegativeMonth);
    document.querySelector('#metric-event-detail').textContent = summary.cashNegativeMonth === null
      ? `30 年后 ${formatMoney(summary.finalCash)}`
      : `${formatDuration(summary.cashNegativeMonth)}首次转负 · 期末 ${formatMoney(summary.finalCash)}`;
  } else {
    document.querySelector('#metric-event-label').textContent = '资产超过贷款';
    document.querySelector('#metric-event').textContent = summary.crossoverMonth === null
      ? '30 年以后'
      : formatMonth(summary.crossoverMonth);
    document.querySelector('#metric-event-detail').textContent = summary.crossoverMonth === null
      ? '当前情景下尚未超过'
      : formatDuration(summary.crossoverMonth);
  }

  document.querySelector('#metric-stock').textContent = formatMoney(summary.finalStock);
  document.querySelector('#metric-stock-detail').textContent = `累计投入 ${formatMoney(summary.investedCapital)}`;
  document.querySelector('#pre-retirement-net').textContent = signedMoney(summary.preRetirementNet);
  document.querySelector('#retirement-summary').textContent = form.elements.retirementDate.value.replace('-', '.');
  document.querySelector('#post-retirement-net').textContent = signedMoney(summary.postRetirementNet);
  chartCanvas.setAttribute('aria-label', isPro
    ? '未来 30 年的贷款、纳斯达克资产和现金存款曲线'
    : '未来 30 年的贷款和纳斯达克资产曲线');

  renderLegend(series);
  chart.setData({ points, series, scale });
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
  updateRetirementIncomeField();
  scheduleRender();
});
form.addEventListener('change', () => {
  updateRetirementIncomeField();
  scheduleRender();
});

document.querySelectorAll('[data-plan-button]').forEach((button) => {
  button.addEventListener('click', () => {
    plan = button.dataset.planButton;
    document.body.dataset.plan = plan;
    document.querySelectorAll('[data-plan-button]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    scheduleRender();
  });
});

document.querySelectorAll('[data-scale-button]').forEach((button) => {
  button.addEventListener('click', () => {
    scale = button.dataset.scaleButton;
    document.querySelectorAll('[data-scale-button]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    scheduleRender();
  });
});

settingsToggle.addEventListener('click', () => {
  const collapsed = settings.dataset.collapsed === 'true';
  settings.dataset.collapsed = String(!collapsed);
  settingsToggle.setAttribute('aria-expanded', String(collapsed));
  settingsToggle.querySelector('span').textContent = collapsed ? '收起' : '展开';
});

updateRetirementIncomeField();
render();
