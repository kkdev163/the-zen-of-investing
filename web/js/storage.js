export const SCENARIO_STORAGE_KEY = 'compound-interest.scenario.v1';

export function loadSavedScenario(storage) {
  if (!storage) return null;
  try {
    const saved = JSON.parse(storage.getItem(SCENARIO_STORAGE_KEY));
    if (!saved || saved.version !== 1 || typeof saved.values !== 'object' || saved.values === null) {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function saveScenario(storage, scenario) {
  if (!storage) return false;
  try {
    storage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify({ version: 1, ...scenario }));
    return true;
  } catch {
    return false;
  }
}
