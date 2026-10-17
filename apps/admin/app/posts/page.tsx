'use client';

import { useState, type FormEvent } from 'react';
import { Frame, Guard, Loading, formatDate, moderate, useModeration, useStaff } from '../painel';

interface Post {
  id: string;
  type: string;
  urgency: string;
  status: string;
  reviewStatus: string;
  hidden: boolean;
  description: string;
  approxLabel: string;
  createdAt: string;
  authorHandle: string;
  authorName: string;
  animalName: string | null;
  species: string;
  thumbUrl: string | null;
}

const typeLabel: Record<string, string> = {
  rescue_alert: 'Resgate',
  update: 'Atualização',
  adoption: 'Adoção',
  help_request: 'Pedido de ajuda',
  lost: 'Perdido',
};

const statusLabel: Record<string, string> = {
  open: 'Aberto',
  on_the_way: 'A caminho',
  not_found: 'Não encontrado',
  rescued: 'Resgatado',
  fostered: 'Lar temporário',
  for_adoption: 'Para adoção',
  adopted: 'Adotado',
};

const urgencyLabel: Record<string, string> = {
  high: 'Urgente',
  medium: 'Atenção',
  low: 'Pode esperar',
};

const speciesLabel: Record<string, string> = { dog: 'Cachorro', cat: 'Gato', other: 'Outro' };

const filters = [
  { value: 'pending', label: 'Esperando revisão' },
  { value: 'recent', label: 'Recentes' },
  { value: 'hidden', label: 'Fora do ar' },
] as const;

export default function PostsPage() {
  const me = useStaff();
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>('pending');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const allowed = Boolean(me?.permissions.includes('posts.moderate'));
  const query = `posts?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const { data, message, reload } = useModeration<{ posts: Post[] }>(allowed ? query : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(post: Post, path: string, body: unknown) {
    setBusy(post.id);
    setError('');
    const failure = await moderate(`posts/${post.id}/${path}`, body);
    setBusy(null);
    if (failure) setError(failure);
    reload();
  }

  function toggleVisibility(post: Post, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const justification = String(new FormData(event.currentTarget).get('justification') ?? '');
    void run(post, 'visibility', { hidden: !post.hidden, justification });
  }

  return (
    <Guard me={me} permission="posts.moderate" label="os posts">
      {(staff) => (
        <Frame me={staff}>
          <div className="stack">
            <h1>Posts</h1>
            <div className="tabs">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                setQ(search.trim());
              }}
            >
              <input
                style={{ flex: 1, minWidth: 200 }}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar no texto, no @ do autor ou no nome do animal"
              />
              <button type="submit">Buscar</button>
            </form>
            {message ? <p className="error">{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            {!data && !message ? <Loading /> : null}
            {data && data.posts.length === 0 ? <p className="muted">Nenhum post aqui.</p> : null}
            {(data?.posts ?? []).map((post) => (
              <article key={post.id} className="card item">
                {post.thumbUrl ? (
                  // Foto vem do imgproxy, fora do domínio do painel.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="thumb"
                    src={post.thumbUrl}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <div className="thumb" />
                )}
                <div className="stack">
                  <div className="row">
                    <span className="badge">{typeLabel[post.type] ?? post.type}</span>
                    <span className={`badge${post.urgency === 'high' ? ' warn' : ''}`}>
                      {urgencyLabel[post.urgency] ?? post.urgency}
                    </span>
                    <span className="badge">{statusLabel[post.status] ?? post.status}</span>
                    {post.reviewStatus === 'pending' ? (
                      <span className="badge warn">Esperando revisão</span>
                    ) : null}
                    {post.reviewStatus === 'rejected' ? (
                      <span className="badge">Recusado</span>
                    ) : null}
                    {post.hidden ? <span className="badge warn">Fora do ar</span> : null}
                  </div>
                  <strong>
                    {post.animalName ?? speciesLabel[post.species] ?? post.species} ·{' '}
                    {post.approxLabel}
                  </strong>
                  <p>{post.description}</p>
                  <p className="muted">
                    {post.authorName} @{post.authorHandle} · {formatDate(post.createdAt)}
                  </p>
                  <div className="row">
                    {post.reviewStatus === 'pending' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy === post.id}
                          onClick={() => void run(post, 'review', { action: 'approve' })}
                        >
                          Publicar
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={busy === post.id}
                          onClick={() => void run(post, 'review', { action: 'reject' })}
                        >
                          Recusar
                        </button>
                      </>
                    ) : null}
                  </div>
                  <form className="row" onSubmit={(event) => toggleVisibility(post, event)}>
                    <input
                      name="justification"
                      required
                      minLength={10}
                      placeholder="Motivo (vai para a auditoria)"
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button
                      type="submit"
                      className={post.hidden ? undefined : 'danger'}
                      disabled={busy === post.id}
                    >
                      {post.hidden ? 'Voltar ao ar' : 'Tirar do ar'}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        </Frame>
      )}
    </Guard>
  );
}
