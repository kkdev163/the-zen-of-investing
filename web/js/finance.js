export const START_YEAR = 2026;
export const START_MONTH = 8;
export const PROJECTION_MONTHS = 30 * 12;

const MONTHS_PER_YEAR = 12;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value) {
  return Math.max(0, finiteNumber(value));
}

export function monthIndexFromValue(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return PROJECTION_MONTHS;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return Math.max(0, (year - START_YEAR) * MONTHS_PER_YEAR + month - START_MONTH);
}

export function dateAtMonth(index) {
  const absoluteMonth = START_MONTH + index;
  return {
    year: START_YEAR + Math.floor(absoluteMonth / MONTHS_PER_YEAR),
    month: absoluteMonth % MONTHS_PER_YEAR
  };
}

export function calculateEqualPayment(principal, annualRate, months) {
  const safePrincipal = nonNegative(principal);
  const safeMonths = Math.max(1, Math.round(nonNegative(months)));
  const monthlyRate = finiteNumber(annualRate) / 100 / MONTHS_PER_YEAR;
  if (monthlyRate === 0) return safePrincipal / safeMonths;
  const growth = (1 + monthlyRate) ** safeMonths;
  return safePrincipal * monthlyRate * growth / (growth - 1);
}

export function projectScenario(rawInputs) {
  const inputs = {
    plan: rawInputs.plan === 'pro' ? 'pro' : 'basic',
    loanPrincipal: nonNegative(rawInputs.loanPrincipal),
    loanAnnualRate: finiteNumber(rawInputs.loanAnnualRate),
    repaymentMethod: rawInputs.repaymentMethod === 'equal-principal' ? 'equal-principal' : 'equal-payment',
    remainingYears: Math.max(0.1, nonNegative(rawInputs.remainingYears)),
    stockPrincipal: nonNegative(rawInputs.stockPrincipal),
    monthlyInvestment: nonNegative(rawInputs.monthlyInvestment),
    stockAnnualReturn: Math.max(-99.9, finiteNumber(rawInputs.stockAnnualReturn)),
    initialCash: nonNegative(rawInputs.initialCash),
    monthlyIncome: nonNegative(rawInputs.monthlyIncome),
    monthlyExpenses: nonNegative(rawInputs.monthlyExpenses),
    retirementMonth: Math.max(0, Math.round(nonNegative(rawInputs.retirementMonth))),
    postRetirementIncome: nonNegative(rawInputs.postRetirementIncome)
  };

  const loanMonths = Math.max(1, Math.round(inputs.remainingYears * MONTHS_PER_YEAR));
  const loanMonthlyRate = inputs.loanAnnualRate / 100 / MONTHS_PER_YEAR;
  const stockMonthlyRate = (1 + inputs.stockAnnualReturn / 100) ** (1 / MONTHS_PER_YEAR) - 1;
  const equalPayment = calculateEqualPayment(inputs.loanPrincipal, inputs.loanAnnualRate, loanMonths);
  const equalPrincipalAmount = inputs.loanPrincipal / loanMonths;

  let loan = inputs.loanPrincipal;
  let stock = inputs.stockPrincipal;
  let cash = inputs.initialCash;
  let totalInterest = 0;
  let firstPayment = 0;
  let firstInterest = 0;
  let payoffMonth = null;
  let cashNegativeMonth = cash < 0 ? 0 : null;
  let retirementPayment = null;
  const points = [];

  for (let month = 0; month <= PROJECTION_MONTHS; month += 1) {
    points.push({ month, loan, stock, cash });
    if (month === PROJECTION_MONTHS) break;

    let actualPayment = 0;
    let interest = 0;
    if (loan > 0 && month < loanMonths) {
      interest = loan * loanMonthlyRate;
      const scheduledPrincipal = inputs.repaymentMethod === 'equal-principal'
        ? equalPrincipalAmount
        : equalPayment - interest;
      const principalPayment = month === loanMonths - 1
        ? loan
        : Math.min(loan, Math.max(0, scheduledPrincipal));
      actualPayment = principalPayment + interest;
      loan = Math.max(0, loan - principalPayment);
      totalInterest += interest;
      if (month === 0) {
        firstPayment = actualPayment;
        firstInterest = interest;
      }
      if (loan === 0 && payoffMonth === null) payoffMonth = month + 1;
    }

    stock = stock * (1 + stockMonthlyRate) + inputs.monthlyInvestment;

    if (inputs.plan === 'pro') {
      const cashFlowMonth = month + 1;
      const income = cashFlowMonth >= inputs.retirementMonth
        ? inputs.postRetirementIncome
        : inputs.monthlyIncome;
      if (cashFlowMonth >= inputs.retirementMonth && retirementPayment === null) {
        retirementPayment = actualPayment;
      }
      const cashBefore = cash;
      cash += income - inputs.monthlyExpenses - inputs.monthlyInvestment - actualPayment;
      if (cash <= 0 && cashBefore > 0 && cashNegativeMonth === null) cashNegativeMonth = cashFlowMonth;
    }
  }

  const crossover = points.find((point) => point.stock >= point.loan);
  const finalPoint = points.at(-1);
  return {
    inputs,
    points,
    summary: {
      loanMonths,
      payoffMonth,
      firstPayment,
      firstInterest,
      firstPrincipal: firstPayment - firstInterest,
      totalInterest,
      crossoverMonth: crossover?.month ?? null,
      cashNegativeMonth,
      finalLoan: finalPoint.loan,
      finalStock: finalPoint.stock,
      finalCash: finalPoint.cash,
      investedCapital: inputs.stockPrincipal + inputs.monthlyInvestment * PROJECTION_MONTHS,
      preRetirementNet: inputs.monthlyIncome - inputs.monthlyExpenses - inputs.monthlyInvestment - firstPayment,
      postRetirementNet: inputs.postRetirementIncome - inputs.monthlyExpenses - inputs.monthlyInvestment - (retirementPayment || 0)
    }
  };
}
