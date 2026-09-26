import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { startOAuth } from '@/utils/oauth';
import { supabase } from '@/utils/infrastructure/supabase';

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
  parse: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('@/utils/infrastructure/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}));

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const parseUrl = Linking.parse as jest.Mock;

const user = { id: 'sb-1', email: 'atlas@example.com' };

describe('startOAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedAuth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: { url: 'https://supabase.example/authorize' },
      error: null,
    });
    openAuthSession.mockResolvedValue({ type: 'success', url: 'exp://redirect?code=abc' });
    parseUrl.mockReturnValue({ queryParams: { code: 'abc' } });
    (mockedAuth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
  });

  it('requests the provider with a redirect and no automatic browser redirect', async () => {
    await startOAuth('discord');

    expect(mockedAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: { redirectTo: 'exp://127.0.0.1:8081/--/', skipBrowserRedirect: true },
    });
  });

  it('returns the exchanged user on success', async () => {
    await expect(startOAuth('discord')).resolves.toEqual(user);
    expect(mockedAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('returns null when the user cancels', async () => {
    openAuthSession.mockResolvedValue({ type: 'cancel' });

    await expect(startOAuth('discord')).resolves.toBeNull();
    expect(mockedAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('returns null when the browser is dismissed', async () => {
    openAuthSession.mockResolvedValue({ type: 'dismiss' });

    await expect(startOAuth('discord')).resolves.toBeNull();
  });

  it('throws when the redirect carries no authorization code', async () => {
    parseUrl.mockReturnValue({ queryParams: {} });

    await expect(startOAuth('discord')).rejects.toThrow('No authorization code');
  });

  it('throws when the code exchange fails', async () => {
    (mockedAuth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: new Error('bad code'),
    });

    await expect(startOAuth('discord')).rejects.toThrow('bad code');
  });
});
