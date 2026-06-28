export function createAppStore(initialState = {}) {
  const state = { ...initialState };
  const listeners = new Set();

  function notify(action = "state:update") {
    listeners.forEach((listener) => listener(state, action));
  }

  function set(key, value, action = `state:set:${key}`) {
    state[key] = value;
    notify(action);
    return value;
  }

  function update(key, updater, action = `state:update:${key}`) {
    return set(key, updater(state[key], state), action);
  }

  function patch(values, action = "state:patch") {
    Object.assign(state, values);
    notify(action);
    return state;
  }

  function reset(values = initialState, action = "state:reset") {
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, values);
    notify(action);
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { state, set, update, patch, reset, subscribe };
}
