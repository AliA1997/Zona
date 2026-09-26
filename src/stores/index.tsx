import React, { createContext, useContext, useEffect, useMemo } from 'react';

import { AuthStore } from '@/stores/auth-store';
import { setUnauthorizedHandler } from '@/utils/api/agent';

export type Store = {
  authStore: AuthStore;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo<Store>(() => ({ authStore: new AuthStore() }), []);

  useEffect(() => {
    // agent.ts cannot import the store (the store imports the api clients), so the
    // 401 path is wired in from this side exactly once.
    setUnauthorizedHandler(() => {
      void store.authStore.resetAuthState();
    });

    void store.authStore.initializeFromStorage();
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore must be used inside a StoreProvider.');
  }
  return store;
}
