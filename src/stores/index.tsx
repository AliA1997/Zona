import { reaction } from 'mobx';
import React, { createContext, useContext, useEffect, useMemo } from 'react';

import { AuthStore } from '@/stores/auth-store';
import { FeedStore } from '@/stores/feed-store';
import { setUnauthorizedHandler } from '@/utils/api/agent';

export type Store = {
  authStore: AuthStore;
  feedStore: FeedStore;
};

export function createStore(): Store {
  const authStore = new AuthStore();
  const feedStore = new FeedStore(() => authStore.identity?.id);
  return { authStore, feedStore };
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo<Store>(() => createStore(), []);

  useEffect(() => {
    // agent.ts cannot import the store (the store imports the api clients), so the
    // 401 path is wired in from this side exactly once.
    const unregister = setUnauthorizedHandler(() => {
      void store.authStore.resetAuthState();
    });

    // Signing out or switching accounts must never show the previous user's feed.
    const disposeReaction = reaction(
      () => store.authStore.identity?.id,
      () => store.feedStore.reset()
    );

    void store.authStore.initializeFromStorage();
    return () => {
      unregister();
      disposeReaction();
    };
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
