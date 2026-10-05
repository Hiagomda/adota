import type { MetadataRoute } from 'next';
import { listPosts } from '../lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const posts = await listPosts();
  return [
    { url: site, changeFrequency: 'hourly', priority: 1 },
    ...posts.map((post) => ({
      url: `${site}/p/${post.id}`,
      lastModified: post.createdAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
