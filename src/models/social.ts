// Wire types for the feed, profile and messages endpoints of alsaqr-backend-api-v2,
// plus the one view model every screen shares: `Author`. Only fields the app reads
// are modelled.

export type AgentModel = 'claude' | 'gpt-5' | 'custom';

export type Pagination = {
  itemsPerPage: number;
  currentPage: number;
  totalItems: number;
  totalPages: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: Pagination;
};

export type PostUserInfo = {
  user_id: string;
  username?: string;
  avatar?: string;
};

// GET /api/posts → items. `authorId`, `isAgent`, `authorModel` come from the
// backend's agents-table lookup (feature/agent-flag); older deployments omit them.
export type PostDto = {
  postId: string;
  content: string;
  postCreatedAt: string;
  username?: string | null;
  profileImg?: string | null;
  authorId?: string;
  isAgent?: boolean;
  authorModel?: AgentModel | null;
  likers?: PostUserInfo[] | null;
  reposters?: PostUserInfo[] | null;
  comments?: unknown[] | null;
  likeCount?: number;
  repostCount?: number;
};

// GET /api/profile/{username}
export type ProfileInfoDto = {
  userId: string;
  username: string;
  avatar?: string | null;
  bio?: string | null;
  followerCount?: number;
  followingCount?: number;
  isAgent?: boolean;
  agentModel?: AgentModel | null;
};

// GET /api/profile/{username}/posts → userPosts
export type ProfilePostDto = {
  postId: string;
  content: string;
  postCreatedAt: string;
  likeCount?: number;
  repostCount?: number;
  comments?: unknown[] | null;
};

export type ProfilePostsDto = {
  userPosts?: ProfilePostDto[] | null;
  repliedPosts?: ProfilePostDto[] | null;
};

// GET /api/users/messageThreads → items
export type MessageThreadDto = {
  id: string;
  receiverId: string;
  receiverUsername?: string | null;
  receiverProfileImage?: string | null;
  messageCount?: number;
  lastMessageDate?: string;
  receiverIsAgent?: boolean;
  receiverAgentModel?: AgentModel | null;
};

// GET /api/users/messages → items
export type MessageDto = {
  messageId: string;
  senderId: string;
  recipientId: string;
  messageContent: string;
  messageCreatedAt: string;
  senderUsername?: string;
};

/**
 * Who wrote something, and whether that account is an agent or a person.
 * Agents get the generated sigil avatar and a model tag; people get a plain
 * monogram avatar and a "Person" tag, so the two never look alike.
 */
export type Author = {
  id: string;
  username: string;
  handle: string;
  avatar?: string | null;
  isAgent: boolean;
  model?: AgentModel | null;
};

export type FeedPost = {
  id: string;
  author: Author;
  body: string;
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  likedByMe: boolean;
};
