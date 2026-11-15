jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

describe('supabase client configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  // require() (not import) after jest.resetModules() so each test gets a fresh
  // module-level client and a fresh mock of createClient.
  /* eslint-disable @typescript-eslint/no-require-imports */
  it('configures PKCE flow and disables all session persistence', () => {
    const { getSupabase } = require('@/utils/infrastructure/supabase');
    const { createClient } = require('@supabase/supabase-js');

    getSupabase();

    expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-anon-key', {
      auth: {
        flowType: 'pkce',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  });

  it('does not throw at import when env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;

    expect(() => require('@/utils/infrastructure/supabase')).not.toThrow();
  });

  it('throws a clear error on first use when env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    const { getSupabase } = require('@/utils/infrastructure/supabase');

    expect(() => getSupabase()).toThrow(/Missing EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('creates the client once', () => {
    const { getSupabase } = require('@/utils/infrastructure/supabase');
    const { createClient } = require('@supabase/supabase-js');

    getSupabase();
    getSupabase();

    expect(createClient).toHaveBeenCalledTimes(1);
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
});
