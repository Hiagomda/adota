import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPost } from '../../../lib/api';
import { helpKindLabel, speciesLabel, statusLabel, urgencyLabel } from '../../../lib/labels';
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
  const photo = post.media[0]?.url;

  return (
    <main className="page">
      <article className="post">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="post-photo" src={photo} alt={post.approxLabel} />
        ) : null}
        <div className="post-copy">
          <div className="meta">
            <span className={`chip ${post.urgency}`}>{urgencyLabel[post.urgency]}</span>
            <span>{statusLabel[post.status]}</span>
          </div>
          <h1>{post.approxLabel}</h1>
          <p>{post.description}</p>
          <p>
            {speciesLabel[post.animal.species] ?? 'Animal'} · publicado por @{post.author.handle}
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
