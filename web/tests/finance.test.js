import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PROJECTION_MONTHS,
  PROJECTION_MONTHS,
  calculateEqualPayment,
  monthIndexFromValue,
  projectScenario
} from '../js/finance.js';

const baseInputs = {
  plan: 'basic',
  loanPrincipal: 2_700_000,
  loanAnnualRate: 2.8,
  repaymentMethod: 'equal-payment',
  remainingYears: 28,
  stockPrincipal: 1_000_000,
  monthlyInvestment: 20_000,
  stockAnnualReturn: 10,
  initialCash: 1_000_000,
  monthlyIncome: 60_000,
  monthlyExpenses: 10_000,
  retirementMonth: 240,
  postRetirementIncome: 0
};

test('equal-payment loan reaches zero at the configured term', () => {
  const result = projectScenario(baseInputs);
  const expectedTotalInterest = calculateEqualPayment(2_700_000, 2.8, 336) * 336 - 2_700_000;
  assert.equal(result.summary.payoffMonth, 336);
  assert.equal(result.summary.finalLoan, 0);
  assert.ok(Math.abs(result.summary.firstPayment - calculateEqualPayment(2_700_000, 2.8, 336)) < 0.01);
  assert.ok(Math.abs(result.summary.totalInterest - expectedTotalInterest) < 0.01);
  assert.equal(result.points[0].cumulativeInterest, 0);
  assert.ok(Math.abs(result.points[1].cumulativeInterest - result.summary.firstInterest) < 0.01);
  assert.ok(Math.abs(result.points[336].cumulativeInterest - result.summary.totalInterest) < 0.01);
});

test('equal-principal payment declines while principal reaches zero', () => {
  const result = projectScenario({ ...baseInputs, repaymentMethod: 'equal-principal' });
  const monthlyPrincipal = 2_700_000 / 336;
  const expectedTotalInterest = 2_700_000 * (2.8 / 100 / 12) * (336 + 1) / 2;
  assert.ok(Math.abs(result.summary.firstPrincipal - monthlyPrincipal) < 0.01);
  assert.ok(Math.abs(result.summary.totalInterest - expectedTotalInterest) < 0.01);
  assert.equal(result.summary.payoffMonth, 336);
  assert.equal(result.summary.finalLoan, 0);
});

test('projection extends to a 40-year loan payoff and caps longer terms', () => {
  const result = projectScenario({ ...baseInputs, remainingYears: 40 });
  assert.equal(result.summary.projectionMonths, MAX_PROJECTION_MONTHS);
  assert.equal(result.summary.payoffMonth, MAX_PROJECTION_MONTHS);
  assert.equal(result.points.length, MAX_PROJECTION_MONTHS + 1);
  assert.equal(result.points.at(-1).loan, 0);
  assert.equal(result.summary.finalStock, result.points[PROJECTION_MONTHS].stock);
  assert.notEqual(result.summary.finalStock, result.points.at(-1).stock);
  assert.equal(
    result.summary.investedCapital,
    baseInputs.stockPrincipal + baseInputs.monthlyInvestment * PROJECTION_MONTHS
  );

  const capped = projectScenario({ ...baseInputs, remainingYears: 50 });
  assert.equal(capped.inputs.remainingYears, 40);
  assert.equal(capped.summary.projectionMonths, MAX_PROJECTION_MONTHS);
});

test('basic plan ignores household cash flow but includes monthly investment', () => {
  const result = projectScenario(baseInputs);
  assert.equal(result.summary.finalCash, 1_000_000);
  assert.equal(result.summary.investedCapital, 1_000_000 + 20_000 * PROJECTION_MONTHS);
  assert.ok(result.summary.finalStock > result.summary.investedCapital);
});

test('pro plan switches to post-retirement income at the selected month', () => {
  const result = projectScenario({
    ...baseInputs,
    plan: 'pro',
    loanPrincipal: 0,
    monthlyInvestment: 0,
    monthlyExpenses: 10_000,
    monthlyIncome: 60_000,
    retirementMonth: 12,
    postRetirementIncome: 5_000
  });
  const expectedCash = 1_000_000 + 11 * 50_000 + (PROJECTION_MONTHS - 11) * -5_000;
  assert.equal(result.summary.finalCash, expectedCash);
  assert.ok(result.summary.cashNegativeMonth !== null);
});

test('cash balance can continue below zero', () => {
  const result = projectScenario({
    ...baseInputs,
    plan: 'pro',
    monthlyIncome: 0,
    retirementMonth: PROJECTION_MONTHS + 1
  });
  assert.ok(result.summary.finalCash < 0);
  assert.ok(result.summary.cashNegativeMonth > 0);
});

test('initial cash can start below zero', () => {
  const result = projectScenario({ ...baseInputs, plan: 'pro', initialCash: -100_000 });
  assert.equal(result.points[0].cash, -100_000);
  assert.equal(result.summary.cashNegativeMonth, 0);
});

test('retirement date converts to months from September 2026', () => {
  assert.equal(monthIndexFromValue('2026-09'), 0);
  assert.equal(monthIndexFromValue('2027-09'), 12);
  assert.equal(monthIndexFromValue('2046-09'), 240);
});
