import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSavedScenario, saveScenario, SCENARIO_STORAGE_KEY } from '../js/storage.js';

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(SCENARIO_STORAGE_KEY, initialValue);
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test('scenario settings round-trip through storage', () => {
  const storage = createStorage();
  const scenario = {
    plan: 'pro',
    scale: 'log',
    values: { monthlyInvestment: '3456', loanPrincipal: '2000000' }
  };

  assert.equal(saveScenario(storage, scenario), true);
  assert.deepEqual(loadSavedScenario(storage), { version: 1, ...scenario });
});

test('invalid or unavailable storage falls back to defaults', () => {
  assert.equal(loadSavedScenario(createStorage('{bad json')), null);
  assert.equal(loadSavedScenario(null), null);
  assert.equal(saveScenario(null, {}), false);
});
