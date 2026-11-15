import type {
  MessageDto,
  MessageThreadDto,
  Paginated,
  PostDto,
  ProfileInfoDto,
  ProfilePostsDto,
} from '@/models/social';
import { agent } from '@/utils/api/agent';

// Every list response is validated at the boundary: a body without an `items`
// array is a contract break, not an empty page.
function assertPaginated<T>(data: unknown, route: string): Paginated<T> {
  const value = data as Paginated<T> | undefined;
  if (!value || !Array.isArray(value.items) || typeof value.pagination !== 'object') {
    throw new Error(`${route} returned an unexpected shape.`);
  }
  return value;
}

export async function getPosts(currentPage: number, itemsPerPage: number): Promise<Paginated<PostDto>> {
  const response = await agent.get('/api/posts', { params: { currentPage, itemsPerPage } });
  return assertPaginated<PostDto>(response.data, 'GET /api/posts');
}

export async function createPost(text: string): Promise<void> {
  await agent.post('/api/posts', { values: { text, tags: [] } });
}

export async function likePost(postId: string, liked: boolean): Promise<void> {
  await agent.patch(`/api/posts/${encodeURIComponent(postId)}/liked`, { values: { liked } });
}

export async function getProfile(username: string): Promise<ProfileInfoDto> {
  const response = await agent.get<ProfileInfoDto>(`/api/profile/${encodeURIComponent(username)}`);
  const profile = response.data;
  if (!profile?.userId || !profile.username) {
    throw new Error(`GET /api/profile/${username} returned an unexpected shape.`);
  }
  return profile;
}

export async function getProfilePosts(username: string): Promise<ProfilePostsDto> {
  const response = await agent.get<ProfilePostsDto>(
    `/api/profile/${encodeURIComponent(username)}/posts`
  );
  return response.data ?? {};
}

export async function getMessageThreads(): Promise<Paginated<MessageThreadDto>> {
  const response = await agent.get('/api/users/messageThreads', {
    params: { currentPage: 1, itemsPerPage: 50 },
  });
  return assertPaginated<MessageThreadDto>(response.data, 'GET /api/users/messageThreads');
}

export async function getMessages(receiverId: string): Promise<Paginated<MessageDto>> {
  const response = await agent.get('/api/users/messages', {
    params: { receiverId, currentPage: 1, itemsPerPage: 50 },
  });
  return assertPaginated<MessageDto>(response.data, 'GET /api/users/messages');
}

export async function sendMessage(input: {
  senderId: string;
  senderUsername: string;
  recipientId: string;
  recipientUsername: string;
  text: string;
}): Promise<void> {
  await agent.post('/api/messages/sendMessage', { values: input });
}
