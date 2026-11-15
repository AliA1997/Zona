import { agent } from '@/utils/api/agent';
import { createPost, getPosts, getProfile, likePost, sendMessage } from '@/utils/api/social-api-client';

jest.mock('@/utils/api/agent', () => ({
  agent: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const mocked = agent as unknown as { get: jest.Mock; post: jest.Mock; patch: jest.Mock };

describe('social api client', () => {
  beforeEach(() => jest.resetAllMocks());

  it('requests a page of posts and validates the shape', async () => {
    mocked.get.mockResolvedValue({ data: { items: [], pagination: { currentPage: 1 } } });

    await expect(getPosts(2, 20)).resolves.toMatchObject({ items: [] });
    expect(mocked.get).toHaveBeenCalledWith('/api/posts', { params: { currentPage: 2, itemsPerPage: 20 } });
  });

  it('rejects a list response without items', async () => {
    mocked.get.mockResolvedValue({ data: { posts: [] } });

    await expect(getPosts(1, 20)).rejects.toThrow('unexpected shape');
  });

  it('wraps create and like bodies in `values`', async () => {
    mocked.post.mockResolvedValue({});
    mocked.patch.mockResolvedValue({});

    await createPost('hi');
    await likePost('p 1', true);

    expect(mocked.post).toHaveBeenCalledWith('/api/posts', { values: { text: 'hi', tags: [] } });
    expect(mocked.patch).toHaveBeenCalledWith('/api/posts/p%201/liked', { values: { liked: true } });
  });

  it('rejects a profile without an id', async () => {
    mocked.get.mockResolvedValue({ data: { username: 'atlas' } });

    await expect(getProfile('atlas')).rejects.toThrow('unexpected shape');
  });

  it('sends a message to the messages controller', async () => {
    mocked.post.mockResolvedValue({});
    const input = { senderId: 'a', senderUsername: 'me', recipientId: 'b', recipientUsername: 'you', text: 'yo' };

    await sendMessage(input);

    expect(mocked.post).toHaveBeenCalledWith('/api/messages/sendMessage', { values: input });
  });
});
