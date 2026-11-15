import { isAxiosError } from 'axios';
import { makeAutoObservable, runInAction } from 'mobx';

import type { OAuthProvider, SessionUser, StoredIdentity } from '@/models/session';
import { signIn } from '@/utils/api/auth-api-client';
import { sessionCheck } from '@/utils/api/user-api-client';
import { auth } from '@/utils/auth';
import { getSupabase } from '@/utils/infrastructure/supabase';
import { startOAuth } from '@/utils/oauth';

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  discord: 'Discord',
  facebook: 'Facebook',
};

export function messageForError(error: unknown, provider: OAuthProvider): string {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 400) return 'That account is missing an email address.';
  if (status !== undefined || isAxiosError(error)) {
    return "Couldn't reach Zona. Check your connection and try again.";
  }
  return `Couldn't sign in with ${PROVIDER_LABELS[provider]}. Try again.`;
}

// `identity.id` is the single source of truth for "who am I" — pass it explicitly
// to any API call that needs it. Never rely on the server's cached session (the
// backend's UserCacheService is a global, not-per-user singleton — see the spec's
// "Server-side identity is a process-wide singleton" section).
export class AuthStore {
  identity?: StoredIdentity = undefined;
  sessionUser?: SessionUser = undefined;
  restoring = true;
  signingIn = false;
  authError?: string = undefined;

  constructor() {
    makeAutoObservable(this);
  }

  get isAuthenticated(): boolean {
    return !!this.identity;
  }

  initializeFromStorage = async (): Promise<void> => {
    let token: string | null = null;
    let identity: StoredIdentity | null = null;

    try {
      [token, identity] = await Promise.all([auth.getToken(), auth.getIdentity()]);
    } catch {
      // Storage is unreadable (unsupported platform, keychain fault). Treat as signed
      // out rather than leaving `restoring` true forever, which would strand the app
      // on the splash screen with no way to recover.
    }

    // A token without an identity (or the reverse) is a half-written session — most
    // likely the app died mid sign-in. Neither half is usable on its own.
    if (!token || !identity) {
      await this.clearStoredSession();
      runInAction(() => {
        this.identity = undefined;
        this.sessionUser = undefined;
        this.restoring = false;
      });
      return;
    }

    runInAction(() => {
      this.identity = identity;
      this.restoring = false;
    });

    void this.refreshSessionUser();
  };

  signInWithProvider = async (provider: OAuthProvider): Promise<void> => {
    if (this.signingIn) return;

    runInAction(() => {
      this.signingIn = true;
      this.authError = undefined;
    });

    try {
      const user = await startOAuth(provider);
      if (!user) return;

      if (!user.email) {
        runInAction(() => {
          this.authError = `Your ${PROVIDER_LABELS[provider]} account has no email address, which Zona needs to sign you in.`;
        });
        return;
      }

      const { accessToken } = await signIn(user);
      await auth.setToken(accessToken);

      let sessionUser: SessionUser;
      let identity: StoredIdentity;
      try {
        sessionUser = await sessionCheck(user.email);
        identity = {
          id: sessionUser.id,
          username: sessionUser.username,
          email: sessionUser.email,
          avatar: sessionUser.avatar,
        };
        await auth.setIdentity(identity);
      } catch (error) {
        // Never leave half a session behind: if either the check or the identity
        // write fails, clear both halves.
        await this.clearStoredSession().catch(() => {});
        throw error;
      }

      runInAction(() => {
        this.identity = identity;
        this.sessionUser = sessionUser;
      });
    } catch (error) {
      runInAction(() => {
        this.authError = messageForError(error, provider);
      });
    } finally {
      runInAction(() => {
        this.signingIn = false;
      });
    }
  };

  refreshSessionUser = async (): Promise<void> => {
    const email = this.identity?.email;
    if (!email) return;

    try {
      const sessionUser = await sessionCheck(email);
      runInAction(() => {
        this.sessionUser = sessionUser;
      });
    } catch (error) {
      // Not proof of a signed-out user (offline, 500, rate limit) — keep the cached
      // identity, but leave a trace, since nothing else surfaces this.
      console.warn('[auth] background session refresh failed', error);
    }
  };

  // Sign out and the 401 path both land here. Local state is cleared first and
  // unconditionally; the Supabase sign-out is best-effort and never awaited, so an
  // offline device or missing config cannot stop the user from signing out.
  // The backend JWT is not revoked server-side (no endpoint for it yet).
  resetAuthState = async (): Promise<void> => {
    try {
      await this.clearStoredSession();
    } finally {
      runInAction(() => {
        this.identity = undefined;
        this.sessionUser = undefined;
        this.authError = undefined;
      });
    }

    try {
      void getSupabase()
        .auth.signOut({ scope: 'local' })
        .catch(() => {});
    } catch {
      // Supabase not configured; nothing to sign out of.
    }
  };

  private clearStoredSession = async (): Promise<void> => {
    await Promise.all([auth.clearToken(), auth.clearIdentity()]);
  };
}
