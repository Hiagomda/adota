'use client';

import { useEffect, useState } from 'react';
import { Frame, Loading, useStaff } from '../painel';

interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export default function AuditPage() {
  const me = useStaff();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!me?.permissions.includes('audit.read')) return;
    let active = true;
    void fetch('/api/audit')
      .then(async (response) => {
        const body = (await response.json()) as { events?: AuditEvent[]; message?: string };
        if (!active) return;
        if (!response.ok) setMessage(body.message ?? 'Não consegui carregar a auditoria.');
        else setEvents(body.events ?? []);
      })
      .catch(() => {
        if (active) setMessage('Não consegui carregar a auditoria.');
      });
    return () => {
      active = false;
    };
  }, [me]);

  if (me === undefined) return <Loading />;
  if (!me)
    return (
      <main>
        <p>Entre no painel para ver a auditoria.</p>
      </main>
    );
  if (!me.permissions.includes('audit.read')) {
    return (
      <Frame me={me}>
        <p>Sua conta não abre a auditoria.</p>
      </Frame>
    );
  }

  return (
    <Frame me={me}>
      <h1>Auditoria</h1>
      <p className="muted">Registro só de inclusão. A API não tem rota para editar ou apagar.</p>
      {message ? <p className="error">{message}</p> : null}
      {events === null ? <Loading /> : null}
      {events && events.length === 0 ? <p>Nenhuma ação registrada ainda.</p> : null}
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Ação</th>
            <th>Antes</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          {(events ?? []).map((event) => (
            <tr key={event.id}>
              <td>{new Date(event.createdAt).toLocaleString('pt-BR')}</td>
              <td>
                {event.action}
                <div className="muted">{event.targetId ?? ''}</div>
              </td>
              <td>
                <code>{JSON.stringify(event.before)}</code>
              </td>
              <td>
                <code>{JSON.stringify(event.after)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}
