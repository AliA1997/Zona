import { sessionCheck } from '@/utils/api/user-api-client';
import { agent } from '@/utils/api/agent';

jest.mock('@/utils/api/agent', () => ({
  agent: { post: jest.fn() },
}));

const post = agent.post as jest.Mock;

const sessionUser = {
  id: 'u-1',
  username: 'atlas',
  email: 'atlas@example.com',
  avatar: 'https://example.com/a.png',
};

describe('sessionCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({ data: { result: sessionUser } });
  });

  it('posts the email under a values envelope and unwraps the result', async () => {
    await expect(sessionCheck('atlas@example.com')).resolves.toEqual(sessionUser);
    expect(post).toHaveBeenCalledWith('/api/Session/check', {
      values: { email: 'atlas@example.com' },
    });
  });

  // Review Focus #5: a result with no id would otherwise persist a token with no
  // identity — a half session that renders as signed in forever.
  it('throws when the result carries no id', async () => {
    post.mockResolvedValue({ data: { result: { username: 'atlas' } } });

    await expect(sessionCheck('atlas@example.com')).rejects.toThrow('no user');
  });

  it('throws when the response has no result at all', async () => {
    post.mockResolvedValue({ data: {} });

    await expect(sessionCheck('atlas@example.com')).rejects.toThrow('no user');
  });
});
