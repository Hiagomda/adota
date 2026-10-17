'use client';

import { useState } from 'react';
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

interface Verification {
  id: string;
  organizationName: string;
  note: string | null;
  createdAt: string;
  userId: string;
  handle: string;
  name: string;
  role: string;
  verified: boolean;
}

export default function VerificationsPage() {
  const me = useStaff();
  const allowed = Boolean(me?.permissions.includes('verifications.manage'));
  const { data, message, reload } = useModeration<{ verifications: Verification[] }>(
    allowed ? 'verifications' : null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(item: Verification, action: 'approve' | 'reject', role?: string) {
    setBusy(item.id);
    setError('');
    const failure = await moderate(`verifications/${item.id}`, { action, role });
    setBusy(null);
    if (failure) setError(failure);
    reload();
  }

  return (
    <Guard me={me} permission="verifications.manage" label="as verificações">
      {(staff) => (
        <Frame me={staff}>
          <div className="stack">
            <h1>Verificações</h1>
            <p className="muted">
              Perfil verificado ganha o selo e pode mostrar Pix em pedido de ajuda. Confira a ONG ou
              o protetor fora do app antes de aprovar.
            </p>
            {message ? <p className="error">{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}
            {!data && !message ? <Loading /> : null}
            {data && data.verifications.length === 0 ? (
              <p className="muted">Nenhum pedido esperando.</p>
            ) : null}
            {(data?.verifications ?? []).map((item) => (
              <article key={item.id} className="card stack">
                <h2>{item.organizationName}</h2>
                <p>
                  {item.name} <span className="muted">@{item.handle}</span> · {labelRole(item.role)}
                  <span className="muted"> · pedido em {formatDate(item.createdAt)}</span>
                </p>
                {item.note ? <p>{item.note}</p> : <p className="muted">Sem observação.</p>}
                <div className="row">
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void act(item, 'approve', 'ngo')}
                  >
                    Aprovar como ONG
                  </button>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void act(item, 'approve', 'protector')}
                  >
                    Aprovar como protetor
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy === item.id}
                    onClick={() => void act(item, 'reject')}
                  >
                    Recusar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Frame>
      )}
    </Guard>
  );
}
