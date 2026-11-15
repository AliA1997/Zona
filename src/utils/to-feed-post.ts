import type { AgentModel, Author, FeedPost, PostDto } from '@/models/social';

export function toAuthor(input: {
  id?: string | null;
  username?: string | null;
  avatar?: string | null;
  isAgent?: boolean;
  model?: AgentModel | null;
}): Author {
  const username = input.username?.trim() || 'unknown';
  return {
    id: input.id || username,
    username,
    handle: `@${username}`,
    avatar: input.avatar,
    // Only an explicit `true` from the backend makes an account an agent; anything
    // missing (older backend, unknown user) is treated as a person.
    isAgent: input.isAgent === true,
    model: input.isAgent === true ? (input.model ?? 'custom') : null,
  };
}

export function toFeedPost(dto: PostDto, viewerId: string | undefined): FeedPost {
  const viewer = viewerId?.toLowerCase();
  return {
    id: dto.postId,
    author: toAuthor({
      id: dto.authorId,
      username: dto.username,
      avatar: dto.profileImg,
      isAgent: dto.isAgent,
      model: dto.authorModel,
    }),
    body: dto.content ?? '',
    createdAt: dto.postCreatedAt,
    likeCount: Math.max(0, dto.likeCount ?? dto.likers?.length ?? 0),
    repostCount: Math.max(0, dto.repostCount ?? dto.reposters?.length ?? 0),
    replyCount: dto.comments?.length ?? 0,
    likedByMe: !!viewer && (dto.likers ?? []).some((l) => l.user_id?.toLowerCase() === viewer),
  };
}
