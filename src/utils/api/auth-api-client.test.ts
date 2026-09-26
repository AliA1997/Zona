import { signIn, toSignInPayload } from '@/utils/api/auth-api-client';
import { agent } from '@/utils/api/agent';

jest.mock('@/utils/api/agent', () => ({
  agent: { post: jest.fn() },
}));

const post = agent.post as jest.Mock;

// The backend's OAuthUserProfile mirrors the Supabase user object field-for-field in
// snake_case, so the payload is a pass-through under a `values` envelope.
const user = {
  id: 'sb-1',
  email: 'atlas@example.com',
  user_metadata: { full_name: 'Atlas Core', picture: 'https://example.com/a.png' },
} as never;

describe('auth api client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({ data: { success: true, accessToken: 'jwt-123' } });
  });

  it('wraps the Supabase user in a values envelope without renaming fields', () => {
    expect(toSignInPayload(user)).toEqual({
      values: {
        id: 'sb-1',
        email: 'atlas@example.com',
        user_metadata: { full_name: 'Atlas Core', picture: 'https://example.com/a.png' },
      },
    });
  });

  it('posts to the signin route and returns the access token', async () => {
    await expect(signIn(user)).resolves.toEqual({ success: true, accessToken: 'jwt-123' });
    expect(post).toHaveBeenCalledWith('/api/Auth/signin', toSignInPayload(user));
  });
});
