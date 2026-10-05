import Link from 'next/link';
import { listPosts } from '../lib/api';
import { speciesLabel, statusLabel, typeLabel, urgencyLabel } from '../lib/labels';
import { formatWhen } from '../lib/time';

export const dynamic = 'force-dynamic';

const filters = [
  { label: 'Todos', type: undefined },
  { label: 'Resgate', type: 'rescue_alert' },
  { label: 'Perdidos', type: 'lost' },
  { label: 'Adoção', type: 'adoption' },
  { label: 'Ajuda', type: 'help_request' },
];

function filterHref(type: string | undefined, species: string | undefined): string {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (species) params.set('species', species);
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; species?: string }>;
}) {
  const query = await searchParams;
  const posts = await listPosts({ type: query.type, species: query.species });
  const speciesFilters = [
    { label: 'Todos os animais', species: undefined },
    { label: 'Cachorros', species: 'dog' },
    { label: 'Gatos', species: 'cat' },
    { label: 'Outros', species: 'other' },
  ];

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
            href={filterHref(filter.type, query.species)}
            data-active={filter.type === query.type || (!filter.type && !query.type)}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      <nav className="filters">
        {speciesFilters.map((filter) => (
          <Link
            key={filter.label}
            href={filterHref(query.type, filter.species)}
            data-active={filter.species === query.species || (!filter.species && !query.species)}
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
            <article className="card" key={post.id}>
              <Link className="photo-wrap" href={`/p/${post.id}`}>
                {post.media[0] ? (
                  // Remote rescue photos come from several hosts; the browser loads them directly.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.media[0].thumbUrl} alt={post.approxLabel} />
                ) : null}
                <div className="photo-chips">
                  <span className={`chip ${post.urgency}`}>{urgencyLabel[post.urgency]}</span>
                  <span className="chip status">{statusLabel[post.status]}</span>
                </div>
              </Link>
              <div className="card-body">
                <div className="meta">
                  <Link href={`/u/${post.author.handle}`}>@{post.author.handle}</Link>
                  <span>{formatWhen(post.createdAt)}</span>
                </div>
                <h2>
                  <Link href={`/p/${post.id}`}>{post.approxLabel}</Link>
                </h2>
                <p>
                  {speciesLabel[post.animal.species] ?? 'Animal'} ·{' '}
                  {typeLabel[post.type] ?? 'Alerta'} · {post.description}
                </p>
                <p>
                  {post.counts.likes} curtidas · {post.counts.comments} comentários
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
