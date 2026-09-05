import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
  assert.equal(result.summary.payoffMonth, 336);
  assert.equal(result.summary.finalLoan, 0);
  assert.ok(Math.abs(result.summary.firstPayment - calculateEqualPayment(2_700_000, 2.8, 336)) < 0.01);
});

test('equal-principal payment declines while principal reaches zero', () => {
  const result = projectScenario({ ...baseInputs, repaymentMethod: 'equal-principal' });
  const monthlyPrincipal = 2_700_000 / 336;
  assert.ok(Math.abs(result.summary.firstPrincipal - monthlyPrincipal) < 0.01);
  assert.equal(result.summary.payoffMonth, 336);
  assert.equal(result.summary.finalLoan, 0);
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

test('retirement date converts to months from September 2026', () => {
  assert.equal(monthIndexFromValue('2026-09'), 0);
  assert.equal(monthIndexFromValue('2027-09'), 12);
  assert.equal(monthIndexFromValue('2046-09'), 240);
});
