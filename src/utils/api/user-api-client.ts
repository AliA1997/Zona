import type { SessionUser } from '@/models/session';
import { agent } from '@/utils/api/agent';

// Note the route has no trailing space, unlike the web client's template literal.
export async function sessionCheck(email: string): Promise<SessionUser> {
  const response = await agent.post<{ result: SessionUser }>('/api/Session/check', {
    values: { email },
  });

  const user = response.data?.result;
  if (!user?.id) {
    throw new Error('Session check returned no user.');
  }

  return user;
}
