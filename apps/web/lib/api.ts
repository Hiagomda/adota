export interface PublicPost {
  id: string;
  type: string;
  urgency: 'low' | 'medium' | 'high';
  description: string;
  approxLabel: string;
  status: 'open' | 'on_the_way' | 'not_found' | 'rescued' | 'fostered' | 'for_adoption' | 'adopted';
  createdAt: string;
  boosted: boolean;
  author: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    role: string;
    verified: boolean;
  };
  animal: {
    species: string;
    size: string;
    sex: string;
    ageEstimate: string | null;
  };
  location: { latitude: number; longitude: number; exact: boolean };
  media: { url: string; thumbUrl: string }[];
  counts: { likes: number; comments: number };
  helpRequest: {
    kind: string;
    goalAmount: string | null;
    pixKey: string | null;
    deadline: string | null;
    paymentNotice: string;
  } | null;
  updates?: {
    id: string;
    description: string;
    status: string;
    createdAt: string;
    author: { name: string; handle: string };
  }[];
}

const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010';

export function apiOrigin(): string {
  return apiUrl;
}

export interface PublicProfile {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  role: string;
  verified: boolean;
  city: string | null;
  counts: { posts: number; helped: number; followers: number; following: number };
}

export async function getProfile(handle: string): Promise<PublicProfile | null> {
  const response = await fetch(`${apiUrl}/users/${encodeURIComponent(handle)}`, {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as PublicProfile;
}

export async function listPosts(
  search: { type?: string; species?: string; authorId?: string } = {},
): Promise<PublicPost[]> {
  const params = new URLSearchParams({ limit: '30' });
  if (search.type) params.set('type', search.type);
  if (search.species) params.set('species', search.species);
  if (search.authorId) params.set('authorId', search.authorId);
  try {
    const response = await fetch(`${apiUrl}/posts?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const body = (await response.json()) as { posts: PublicPost[] };
    return body.posts;
  } catch {
    return [];
  }
}

export async function getPost(id: string): Promise<PublicPost | null> {
  const response = await fetch(`${apiUrl}/posts/${id}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as PublicPost;
}

export interface PublicComment {
  id: string;
  body: string;
  createdAt: string;
  author: { handle: string; name: string };
}

export async function listComments(id: string): Promise<PublicComment[]> {
  const response = await fetch(`${apiUrl}/posts/${id}/comments`, { cache: 'no-store' });
  if (!response.ok) return [];
  const body = (await response.json()) as { comments: PublicComment[] };
  return body.comments;
}
