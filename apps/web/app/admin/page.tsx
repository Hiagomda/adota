'use client';

import { useState } from 'react';
import { apiOrigin } from '../../lib/api';

interface Report {
  id: string;
  target_type: string;
  reason: string;
  status: string;
}

interface Verification {
  id: string;
  organization_name: string;
  handle: string;
  note: string | null;
}

interface Metrics {
  alertsByStatus: { status: string; total: number }[];
  meanSecondsToResponse: number | null;
  adopted: number;
}

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('admin@patinha.local');
  const [reports, setReports] = useState<Report[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [message, setMessage] = useState('Entre com a conta de moderação.');

  async function login() {
    const response = await fetch(`${apiOrigin()}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = (await response.json()) as { token?: string; message?: string };
    if (!response.ok || !body.token) {
      setMessage(body.message ?? 'Não consegui entrar.');
      return;
    }
    setToken(body.token);
    await load(body.token);
  }

  async function load(current = token) {
    const headers = { authorization: `Bearer ${current}` };
    const [reportResponse, verificationResponse, metricResponse] = await Promise.all([
      fetch(`${apiOrigin()}/admin/reports`, { headers }),
      fetch(`${apiOrigin()}/admin/verifications`, { headers }),
      fetch(`${apiOrigin()}/admin/metrics`, { headers }),
    ]);
    if (!reportResponse.ok) {
      setMessage('Essa conta não pode moderar.');
      return;
    }
    setReports(((await reportResponse.json()) as { reports: Report[] }).reports);
    setVerifications(
      ((await verificationResponse.json()) as { verifications: Verification[] }).verifications,
    );
    setMetrics((await metricResponse.json()) as Metrics);
    setMessage('Fila atualizada.');
  }

  async function act(path: string, payload: unknown) {
    await fetch(`${apiOrigin()}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await load();
  }

  return (
    <main className="page">
      <h1>Moderação</h1>
      <p>{message}</p>
      {token ? null : (
        <form
          className="actions"
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="E-mail"
          />
          <button type="submit">Entrar</button>
        </form>
      )}
      {metrics ? (
        <section className="notice">
          <p>Adotados: {metrics.adopted}</p>
          <p>
            Tempo médio até alguém dizer que vai ajudar:{' '}
            {metrics.meanSecondsToResponse === null
              ? 'ainda sem resposta'
              : `${Math.round(metrics.meanSecondsToResponse / 60)} min`}
          </p>
          <ul>
            {metrics.alertsByStatus.map((item) => (
              <li key={item.status}>
                {item.status}: {item.total}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>Denúncias</h2>
        {reports.length === 0 ? <p className="empty">Nenhuma denúncia aberta.</p> : null}
        {reports.map((report) => (
          <article key={report.id} className="notice">
            <p>
              {report.target_type}: {report.reason}
            </p>
            <div className="actions">
              <button
                type="button"
                onClick={() => void act(`/admin/reports/${report.id}`, { action: 'hide' })}
              >
                Ocultar
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void act(`/admin/reports/${report.id}`, { action: 'dismiss' })}
              >
                Dispensar
              </button>
            </div>
          </article>
        ))}
      </section>
      <section>
        <h2>Verificações</h2>
        {verifications.length === 0 ? <p className="empty">Nenhum pedido pendente.</p> : null}
        {verifications.map((item) => (
          <article key={item.id} className="notice">
            <p>
              @{item.handle} · {item.organization_name}
            </p>
            <div className="actions">
              <button
                type="button"
                onClick={() =>
                  void act(`/admin/verifications/${item.id}`, { action: 'approve', role: 'ngo' })
                }
              >
                Aprovar ONG
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  void act(`/admin/verifications/${item.id}`, { action: 'reject', role: 'ngo' })
                }
              >
                Recusar
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
