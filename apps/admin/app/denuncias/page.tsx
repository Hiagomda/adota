'use client';

import { useState } from 'react';
import {
  Empty,
  Frame,
  Guard,
  Loading,
  PageHeader,
  formatDate,
  moderate,
  useModeration,
  useStaff,
} from '../painel';

interface Report {
  id: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporterHandle: string | null;
  targetText: string | null;
  targetHandle: string | null;
  targetHidden: boolean | null;
  reportCount: number;
}

const targetLabel = { post: 'Post', comment: 'Comentário', user: 'Perfil' } as const;
const hideLabel = {
  post: 'Tirar o post do ar',
  comment: 'Esconder o comentário',
  user: 'Suspender a conta',
} as const;

const tabs = [
  { status: 'open', label: 'Abertas' },
  { status: 'hidden', label: 'Tiradas do ar' },
  { status: 'dismissed', label: 'Arquivadas' },
] as const;

export default function ReportsPage() {
  const me = useStaff();
  const [status, setStatus] = useState<(typeof tabs)[number]['status']>('open');
  const allowed = Boolean(me?.permissions.includes('reports.manage'));
  const { data, message, reload } = useModeration<{ reports: Report[] }>(
    allowed ? `reports?status=${status}` : null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(report: Report, action: 'hide' | 'dismiss') {
    setBusy(report.id);
    setError('');
    const failure = await moderate(`reports/${report.id}`, { action });
    setBusy(null);
    if (failure) setError(failure);
    reload();
  }

  return (
    <Guard me={me} permission="reports.manage" label="as denúncias">
      {(staff) => (
        <Frame me={staff}>
          <>
            <PageHeader
              title="Denúncias"
              subtitle="Quem denunciou recebe um aviso no app quando a equipe decide. O alvo não sabe quem denunciou."
            />
            <div className="tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.status}
                  type="button"
                  aria-pressed={status === tab.status}
                  onClick={() => setStatus(tab.status)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {message ? <p className="error">{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            {!data && !message ? <Loading /> : null}
            {data && data.reports.length === 0 ? <Empty>Nenhuma denúncia aqui.</Empty> : null}
            {(data?.reports ?? []).map((report) => (
              <article key={report.id} className={`card stack accent-${report.targetType}`}>
                <div className="row">
                  <span className="badge">{targetLabel[report.targetType]}</span>
                  {report.reportCount > 1 ? (
                    <span className="badge warn">{report.reportCount} denúncias no mesmo alvo</span>
                  ) : null}
                  {report.targetHidden ? (
                    <span className="badge ok">Já está fora do ar</span>
                  ) : null}
                  <span className="muted">{formatDate(report.createdAt)}</span>
                </div>
                <p>
                  <strong>Motivo:</strong> {report.reason}
                  {report.reporterHandle ? (
                    <span className="muted"> · por @{report.reporterHandle}</span>
                  ) : null}
                </p>
                <blockquote className="quote" style={{ margin: 0 }}>
                  {report.targetText ?? <span className="muted">O conteúdo não existe mais.</span>}
                  {report.targetHandle ? <div className="muted">@{report.targetHandle}</div> : null}
                </blockquote>
                {report.status === 'open' ? (
                  <div className="actions">
                    <button
                      type="button"
                      className="danger"
                      disabled={busy === report.id}
                      onClick={() => void act(report, 'hide')}
                    >
                      {hideLabel[report.targetType]}
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      disabled={busy === report.id}
                      onClick={() => void act(report, 'dismiss')}
                    >
                      Arquivar sem ação
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </>
        </Frame>
      )}
    </Guard>
  );
}
