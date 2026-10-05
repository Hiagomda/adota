import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, listPosts } from '../../../lib/api';
import { statusLabel } from '../../../lib/labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle);
  if (!profile) return { title: 'Conta não encontrada' };
  return {
    title: `@${profile.handle}`,
    description: `${profile.name} publica alertas de resgate em Belém.`,
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getProfile(handle);
  if (!profile) notFound();
  const posts = await listPosts({ authorId: profile.id });

  return (
    <main className="page">
      <p className="eyebrow">
        {profile.city ?? 'Belém'}
        {profile.verified ? ' · verificado' : ''}
      </p>
      <h1>{profile.name}</h1>
      <p className="lead">@{profile.handle}</p>
      <p className="counts">
        {profile.counts.posts} posts · {profile.counts.helped} resgates · {profile.counts.followers}{' '}
        seguidores
      </p>
      {posts.length === 0 ? (
        <p className="empty">Essa conta ainda não publicou um alerta visível.</p>
      ) : (
        <section className="grid">
          {posts.map((post) => (
            <Link className="card" href={`/p/${post.id}`} key={post.id}>
              {post.media[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.media[0].thumbUrl} alt={post.approxLabel} />
              ) : null}
              <div className="card-body">
                <h2>{post.approxLabel}</h2>
                <p>{statusLabel[post.status]}</p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
