// Wire and storage types for the auth/session layer. The full record returned by
// /api/Session/check carries follower/bookmark/repost/liked-post arrays; only the
// fields this app reads are modelled, and only the four in StoredIdentity persist.

export type OAuthProvider = 'google' | 'discord' | 'facebook';

export type StoredIdentity = {
  id: string;
  username: string;
  email: string;
  avatar: string;
};

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio?: string;
  isCompleted?: boolean;
};

export type SignInResponse = {
  success: boolean;
  accessToken: string;
};
