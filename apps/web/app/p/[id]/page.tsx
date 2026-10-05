import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, listComments } from '../../../lib/api';
import { helpKindLabel, speciesLabel, statusLabel, urgencyLabel } from '../../../lib/labels';
import { formatWhen } from '../../../lib/time';
import { ShareBar } from './share-bar';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return { title: 'Alerta não encontrado' };
  const title = `${speciesLabel[post.animal.species] ?? 'Animal'} em ${post.approxLabel}`;
  return {
    title,
    description: post.description,
    openGraph: {
      title,
      description: post.description,
      images: [post.media[0]?.url ?? `/p/${id}/opengraph-image`],
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();
  const comments = await listComments(id);

  return (
    <main className="page">
      <article className="post">
        <div className="gallery">
          {post.media.map((media) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={media.url} src={media.url} alt={post.approxLabel} />
          ))}
        </div>
        <div className="post-copy">
          <div className="meta">
            <span className={`chip ${post.urgency}`}>{urgencyLabel[post.urgency]}</span>
            <span>
              {statusLabel[post.status]} · {formatWhen(post.createdAt)}
            </span>
          </div>
          <h1>{post.approxLabel}</h1>
          <p>{post.description}</p>
          <p>
            {speciesLabel[post.animal.species] ?? 'Animal'} · publicado por{' '}
            <Link href={`/u/${post.author.handle}`}>@{post.author.handle}</Link>
            {post.author.verified ? ' · verificado' : ''}
          </p>
          <p>
            Perto de {post.location.latitude.toFixed(3)}, {post.location.longitude.toFixed(3)}. A
            localização pública é aproximada.
          </p>
          {post.helpRequest ? (
            <div className="notice">
              <strong>Pedido de {helpKindLabel[post.helpRequest.kind] ?? 'ajuda'}</strong>
              {post.helpRequest.pixKey ? <p>Pix: {post.helpRequest.pixKey}</p> : null}
              <p>{post.helpRequest.paymentNotice}</p>
            </div>
          ) : null}
          <ShareBar id={post.id} title={post.approxLabel} />
          <section className="comments">
            <h2>Comentários</h2>
            {comments.length === 0 ? (
              <p>Ninguém comentou ainda. A conversa acontece no app.</p>
            ) : null}
            {comments.map((comment) => (
              <article key={comment.id}>
                <strong>@{comment.author.handle}</strong>
                <p>{comment.body}</p>
                <p>{formatWhen(comment.createdAt)}</p>
              </article>
            ))}
          </section>
          {post.updates && post.updates.length > 0 ? (
            <section className="diary">
              {post.updates.map((update) => (
                <article key={update.id}>
                  <strong>@{update.author.handle}</strong>
                  <p>{update.description}</p>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      </article>
    </main>
  );
}
