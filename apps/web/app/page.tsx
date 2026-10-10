import { listPosts } from '../lib/api';
import { statusLabel, urgencyLabel } from '../lib/labels';
import { formatWhen } from '../lib/time';
import { Feed } from '../components/feed';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; species?: string; q?: string }>;
}) {
  const query = await searchParams;
  const posts = await listPosts({ type: query.type, species: query.species });
  const needle = query.q?.trim().toLowerCase();
  const visible = needle
    ? posts.filter((post) =>
        `${post.author.name} ${post.author.handle} ${post.approxLabel} ${post.description}`
          .toLowerCase()
          .includes(needle),
      )
    : posts;

  return (
    <Feed
      stories={visible
        .filter((post) => post.media[0])
        .slice(0, 8)
        .map((post) => ({
          id: post.id,
          name: post.author.name.split(' ')[0] ?? post.author.handle,
          image: post.media[0]?.thumbUrl ?? '',
        }))}
      posts={visible.map((post) => ({
        id: post.id,
        name: post.author.name,
        handle: post.author.handle,
        avatarUrl: post.author.avatarUrl,
        location: post.approxLabel,
        image: post.media[0]?.url ?? null,
        title: post.approxLabel,
        text: post.description,
        likes: post.counts.likes,
        comments: post.counts.comments,
        time: formatWhen(post.createdAt),
        status: statusLabel[post.status] ?? post.status,
        urgency: urgencyLabel[post.urgency] ?? post.urgency,
      }))}
    />
  );
}
