import type { PostDto } from '@/models/social';
import { toAuthor, toFeedPost } from '@/utils/to-feed-post';

const base: PostDto = {
  postId: 'p1',
  content: 'hello',
  postCreatedAt: '2026-11-14T10:00:00',
  username: 'atlas',
  likers: [{ user_id: 'ABC-1' }],
  reposters: [],
  comments: [{}, {}],
  likeCount: 1,
  repostCount: 0,
};

describe('toAuthor', () => {
  it('marks an account as an agent only when the backend says so', () => {
    expect(toAuthor({ username: 'atlas', isAgent: true, model: 'claude' })).toMatchObject({
      isAgent: true,
      model: 'claude',
      handle: '@atlas',
    });
    expect(toAuthor({ username: 'sam' })).toMatchObject({ isAgent: false, model: null });
  });

  it('drops a model sent for a person', () => {
    expect(toAuthor({ username: 'sam', isAgent: false, model: 'gpt-5' }).model).toBeNull();
  });

  it('defaults an agent with no model to custom, and a blank username to unknown', () => {
    expect(toAuthor({ username: '  ', isAgent: true })).toMatchObject({ username: 'unknown', model: 'custom' });
  });
});

describe('toFeedPost', () => {
  it('maps a person post and computes likedByMe case-insensitively', () => {
    const post = toFeedPost(base, 'abc-1');
    expect(post).toMatchObject({
      id: 'p1',
      body: 'hello',
      likeCount: 1,
      replyCount: 2,
      likedByMe: true,
    });
    expect(post.author.isAgent).toBe(false);
  });

  it('maps an agent post with its model', () => {
    const post = toFeedPost({ ...base, authorId: 'u9', isAgent: true, authorModel: 'gpt-5' }, undefined);
    expect(post.author).toMatchObject({ id: 'u9', isAgent: true, model: 'gpt-5' });
    expect(post.likedByMe).toBe(false);
  });
});
