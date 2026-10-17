'use client';

import { useState, type FormEvent } from 'react';
import { icons } from '../icons';
import {
  Empty,
  Frame,
  Guard,
  Loading,
  PageHeader,
  formatDate,
  labelRole,
  moderate,
  useModeration,
  useStaff,
} from '../painel';

interface Person {
  id: string;
  name: string;
  handle: string;
  role: string;
  verified: boolean;
  suspended: boolean;
  createdAt: string;
  posts: number;
  openReports: number;
}

export default function PeoplePage() {
  const me = useStaff();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const allowed = Boolean(me?.permissions.includes('users.read'));
  const canSuspend = Boolean(me?.permissions.includes('users.suspend'));
  const { data, message, reload } = useModeration<{ users: Person[] }>(
    allowed ? `users${q ? `?q=${encodeURIComponent(q)}` : ''}` : null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(person: Person, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const justification = String(new FormData(event.currentTarget).get('justification') ?? '');
    setBusy(person.id);
    setError('');
    const failure = await moderate(`users/${person.id}/suspend`, {
      suspended: !person.suspended,
      justification,
    });
    setBusy(null);
    if (failure) setError(failure);
    reload();
  }

  return (
    <Guard me={me} permission="users.read" label="as pessoas">
      {(staff) => (
        <Frame me={staff}>
          <PageHeader
            title="Pessoas"
            subtitle="Sem telefone nem e-mail aqui. Conta suspensa não entra no app até a equipe liberar."
          />
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              setQ(search.trim());
            }}
          >
            <span className="search">
              {icons.search}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou @"
              />
            </span>
            <button type="submit">Buscar</button>
          </form>
          {message ? <p className="error">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {!data && !message ? <Loading /> : null}
          {data && data.users.length === 0 ? <Empty>Ninguém encontrado.</Empty> : null}
          {(data?.users ?? []).map((person) => (
            <article key={person.id} className="card stack">
              <div className="person">
                <span className="avatar" aria-hidden="true">
                  {person.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="person-meta">
                  <strong>
                    {person.name} <span className="muted">@{person.handle}</span>
                  </strong>
                  <div className="row">
                    <span className="badge">{labelRole(person.role)}</span>
                    {person.verified ? <span className="badge ok">Verificado</span> : null}
                    {person.suspended ? <span className="badge warn">Suspenso</span> : null}
                    {person.openReports > 0 ? (
                      <span className="badge warn">
                        {person.openReports}{' '}
                        {person.openReports === 1 ? 'denúncia aberta' : 'denúncias abertas'}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="numbers">
                  <span>{person.posts} posts</span>
                  <span>desde {formatDate(person.createdAt).split(' ')[0]}</span>
                </div>
              </div>
              {canSuspend ? (
                <form className="actions" onSubmit={(event) => void toggle(person, event)}>
                  <input
                    name="justification"
                    required
                    minLength={10}
                    placeholder="Motivo (vai para a auditoria)"
                  />
                  <button
                    type="submit"
                    className={person.suspended ? undefined : 'danger'}
                    disabled={busy === person.id}
                  >
                    {person.suspended ? 'Liberar conta' : 'Suspender'}
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </Frame>
      )}
    </Guard>
  );
}
