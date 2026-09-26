jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

describe('supabase client configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('configures PKCE flow and disables all session persistence', () => {
    // Must require() (not import) after jest.resetModules() so the module re-reads
    // env vars, and re-require the mocked dependency too — its mock factory runs
    // again on next require, so a reference captured before resetModules would
    // point at a stale, never-called mock function.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/utils/infrastructure/supabase');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js');

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: {
          flowType: 'pkce',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  });

  it('throws a clear error when Supabase env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;

    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/utils/infrastructure/supabase')
    ).toThrow(
      /Missing EXPO_PUBLIC_SUPABASE_URL/
    );
  });
});
