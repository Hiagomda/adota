export interface PublicPost {
  id: string;
  type: string;
  urgency: 'low' | 'medium' | 'high';
  description: string;
  approxLabel: string;
  status: 'open' | 'on_the_way' | 'rescued' | 'fostered' | 'for_adoption' | 'adopted';
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

export async function listPosts(
  search: { type?: string; species?: string } = {},
): Promise<PublicPost[]> {
  const params = new URLSearchParams({ limit: '30' });
  if (search.type) params.set('type', search.type);
  if (search.species) params.set('species', search.species);
  const response = await fetch(`${apiUrl}/posts?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const body = (await response.json()) as { posts: PublicPost[] };
  return body.posts;
}

export async function getPost(id: string): Promise<PublicPost | null> {
  const response = await fetch(`${apiUrl}/posts/${id}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as PublicPost;
}
