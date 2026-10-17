'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

export interface StaffMe {
  id: string;
  name: string;
  handle: string;
  role: string;
  permissions: string[];
}

const roleLabel: Record<string, string> = {
  user: 'Pessoa',
  protector: 'Protetor',
  ngo: 'ONG',
  moderator: 'Moderação',
  support: 'Suporte',
  ong_reviewer: 'Revisão de ONG',
  finance_reviewer: 'Revisão de Pix',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

export function labelRole(role: string): string {
  return roleLabel[role] ?? role;
}

export function useStaff() {
  const [me, setMe] = useState<StaffMe | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void fetch('/api/me')
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setMe(null);
          return;
        }
        setMe((await response.json()) as StaffMe);
      })
      .catch(() => {
        if (active) setMe(null);
      });
    return () => {
      active = false;
    };
  }, []);
  return me;
}

export function Frame({ me, children }: { me: StaffMe; children: ReactNode }) {
  async function logout() {
    await fetch('/api/session', { method: 'DELETE' });
    window.location.assign('/');
  }
  return (
    <main>
      <nav className="nav">
        <strong>Égua, adota!</strong>
        <Link href="/">Início</Link>
        {me.permissions.includes('reports.manage') ? (
          <Link href="/denuncias">Denúncias</Link>
        ) : null}
        {me.permissions.includes('posts.moderate') ? <Link href="/posts">Posts</Link> : null}
        {me.permissions.includes('verifications.manage') ? (
          <Link href="/verificacoes">Verificações</Link>
        ) : null}
        {me.permissions.includes('users.read') ? <Link href="/pessoas">Pessoas</Link> : null}
        {me.permissions.includes('team.read') ? <Link href="/equipe">Equipe</Link> : null}
        {me.permissions.includes('audit.read') ? <Link href="/auditoria">Auditoria</Link> : null}
        <span className="muted">
          {me.name} · {labelRole(me.role)}
        </span>
        <button className="quiet" type="button" onClick={() => void logout()}>
          Sair
        </button>
      </nav>
      {children}
    </main>
  );
}

export function Loading() {
  return (
    <main className="stack">
      <div className="skeleton" />
      <div className="skeleton" />
    </main>
  );
}

/**
 * Carrega uma rota de moderação pelo BFF (`/api/mod/...`). `path` nulo não carrega nada,
 * para a tela esperar a sessão e a permissão.
 */
export function useModeration<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    setMessage('');
    void fetch(`/api/mod/${path}`)
      .then(async (response) => {
        const body = (await response.json()) as T & { message?: string };
        if (!active) return;
        if (!response.ok) setMessage(body.message ?? 'Não consegui carregar.');
        else setData(body);
      })
      .catch(() => {
        if (active) setMessage('Não consegui carregar. Confira a conexão.');
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, message, reload: () => setVersion((value) => value + 1) };
}

/** Envia uma ação de moderação. Devolve a mensagem de erro, ou null se deu certo. */
export async function moderate(path: string, body: unknown): Promise<string | null> {
  try {
    const response = await fetch(`/api/mod/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? 'Não consegui salvar.';
  } catch {
    return 'Não consegui salvar. Confira a conexão.';
  }
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Tela que pede uma permissão: some com o carregando, sem sessão e sem acesso. */
export function Guard({
  me,
  permission,
  label,
  children,
}: {
  me: StaffMe | null | undefined;
  permission: string;
  label: string;
  children: (me: StaffMe) => ReactNode;
}) {
  if (me === undefined) return <Loading />;
  if (!me)
    return (
      <main>
        <p>
          Entre no painel para ver {label}. <Link href="/">Entrar</Link>
        </p>
      </main>
    );
  if (!me.permissions.includes(permission)) {
    return (
      <Frame me={me}>
        <p>Sua conta não abre {label}.</p>
      </Frame>
    );
  }
  return <>{children(me)}</>;
}
