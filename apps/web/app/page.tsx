import Link from 'next/link';
import { listPosts } from '../lib/api';
import { speciesLabel, statusLabel, typeLabel, urgencyLabel } from '../lib/labels';

export const dynamic = 'force-dynamic';

const filters = [
  { href: '/', label: 'Todos', type: undefined },
  { href: '/?type=rescue_alert', label: 'Resgate', type: 'rescue_alert' },
  { href: '/?type=lost', label: 'Perdidos', type: 'lost' },
  { href: '/?type=adoption', label: 'Adoção', type: 'adoption' },
  { href: '/?type=help_request', label: 'Ajuda', type: 'help_request' },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; species?: string }>;
}) {
  const query = await searchParams;
  const posts = await listPosts({ type: query.type, species: query.species });

  return (
    <main className="page">
      <section className="intro">
        <h1>Animais que precisam de gente agora em Belém.</h1>
        <p>
          A localização no site é aproximada, cerca de 500 metros. O ponto exato só aparece no app
          para quem vai ajudar.
        </p>
      </section>
      <nav className="filters">
        {filters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            data-active={filter.type === query.type || (!filter.type && !query.type)}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      {posts.length === 0 ? (
        <p className="empty">Nenhum alerta publicado por aqui ainda.</p>
      ) : (
        <section className="grid">
          {posts.map((post) => (
            <Link className="card" href={`/p/${post.id}`} key={post.id}>
              {post.media[0] ? (
                // Remote rescue photos come from several hosts; the browser loads them directly.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.media[0].thumbUrl} alt={post.approxLabel} />
              ) : null}
              <div className="card-body">
                <div className="meta">
                  <span className={`chip ${post.urgency}`}>{urgencyLabel[post.urgency]}</span>
                  <span>
                    {typeLabel[post.type] ?? 'Alerta'} · {statusLabel[post.status]}
                  </span>
                </div>
                <h2>{post.approxLabel}</h2>
                <p>
                  {speciesLabel[post.animal.species] ?? 'Animal'} · {post.description}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
