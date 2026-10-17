'use client';

import { useState, type FormEvent } from 'react';
import {
  Frame,
  Guard,
  Loading,
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
          <div className="stack">
            <h1>Pessoas</h1>
            <p className="muted">
              Sem telefone nem e-mail aqui. Conta suspensa não entra no app até a equipe liberar.
            </p>
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
                placeholder="Buscar por nome ou @"
              />
              <button type="submit">Buscar</button>
            </form>
            {message ? <p className="error">{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            {!data && !message ? <Loading /> : null}
            {data && data.users.length === 0 ? <p className="muted">Ninguém encontrado.</p> : null}
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Papel</th>
                  <th>Posts</th>
                  {canSuspend ? <th>Suspensão</th> : null}
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((person) => (
                  <tr key={person.id}>
                    <td>
                      {person.name}
                      <div className="muted">
                        @{person.handle} · desde {formatDate(person.createdAt)}
                      </div>
                      <div className="row">
                        {person.verified ? <span className="badge">Verificado</span> : null}
                        {person.suspended ? <span className="badge warn">Suspenso</span> : null}
                        {person.openReports > 0 ? (
                          <span className="badge warn">
                            {person.openReports} denúncia(s) aberta(s)
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{labelRole(person.role)}</td>
                    <td>{person.posts}</td>
                    {canSuspend ? (
                      <td>
                        <form className="stack" onSubmit={(event) => void toggle(person, event)}>
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
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Frame>
      )}
    </Guard>
  );
}
