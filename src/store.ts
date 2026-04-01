// Minimal reactive store, directly mirroring Claude Code's src/state/store.ts pattern
// createStore<T>(initialState, onChange?) → { getState, setState, subscribe }

type Listener<T> = (state: T) => void;

export type Store<T> = {
  getState: () => T;
  setState: (partial: Partial<T>) => void;
  subscribe: (listener: Listener<T>) => () => void;
};

export function createStore<T extends Record<string, unknown>>(
  initialState: T,
  onChange?: (state: T) => void
): Store<T> {
  let state = { ...initialState };
  const listeners = new Set<Listener<T>>();

  return {
    getState() {
      return state;
    },
    setState(partial: Partial<T>) {
      const prev = state;
      state = { ...state, ...partial };
      // Only notify if something actually changed
      const changed = Object.keys(partial).some(
        (k) => !Object.is((prev as any)[k], (partial as any)[k])
      );
      if (changed) {
        onChange?.(state);
        for (const listener of listeners) {
          listener(state);
        }
      }
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
