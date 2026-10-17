'use client';

import { useEffect, useState } from 'react';
import { Empty, Frame, Loading, PageHeader, useStaff } from '../painel';

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

const actionLabel: Record<string, string> = {
  'staff.session_open': 'Entrou no painel',
  'staff.role_change': 'Mudou o papel',
  'report.hide': 'Tirou denúncia do ar',
  'report.dismiss': 'Arquivou denúncia',
  'verification.approve': 'Aprovou verificação',
  'verification.reject': 'Recusou verificação',
  'post.review_approve': 'Publicou post',
  'post.review_reject': 'Recusou post',
  'post.hide': 'Tirou post do ar',
  'post.unhide': 'Voltou post ao ar',
  'user.suspend': 'Suspendeu conta',
  'user.unsuspend': 'Liberou conta',
};

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

  if (me === undefined)
    return (
      <main className="content">
        <Loading />
      </main>
    );
  if (!me)
    return (
      <main className="content">
        <Empty>Entre no painel para ver a auditoria.</Empty>
      </main>
    );
  if (!me.permissions.includes('audit.read')) {
    return (
      <Frame me={me}>
        <Empty>Sua conta não abre a auditoria.</Empty>
      </Frame>
    );
  }

  return (
    <Frame me={me}>
      <PageHeader
        title="Auditoria"
        subtitle="Registro só de inclusão. A API não tem rota para editar ou apagar."
      />
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
                <strong>{actionLabel[event.action] ?? event.action}</strong>
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
