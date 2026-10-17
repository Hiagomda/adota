'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { icons } from './icons';

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

interface Counts {
  openReports: number;
  pendingReview: number;
  pendingVerifications: number;
}

const sections: {
  href: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  count?: keyof Counts;
}[] = [
  { href: '/', label: 'Início', icon: icons.home },
  {
    href: '/denuncias',
    label: 'Denúncias',
    icon: icons.flag,
    permission: 'reports.manage',
    count: 'openReports',
  },
  {
    href: '/posts',
    label: 'Posts',
    icon: icons.posts,
    permission: 'posts.moderate',
    count: 'pendingReview',
  },
  {
    href: '/verificacoes',
    label: 'Verificações',
    icon: icons.badge,
    permission: 'verifications.manage',
    count: 'pendingVerifications',
  },
  { href: '/pessoas', label: 'Pessoas', icon: icons.people, permission: 'users.read' },
  { href: '/equipe', label: 'Equipe', icon: icons.team, permission: 'team.read' },
  { href: '/auditoria', label: 'Auditoria', icon: icons.audit, permission: 'audit.read' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

export function Frame({ me, children }: { me: StaffMe; children: ReactNode }) {
  const pathname = usePathname();
  const { data: counts } = useModeration<Counts>(
    me.permissions.includes('overview.read') ? 'overview' : null,
  );
  async function logout() {
    await fetch('/api/session', { method: 'DELETE' });
    window.location.assign('/');
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Image src="/mascote.webp" alt="" width={40} height={63} priority unoptimized />
          <span>
            <strong>Égua, adota!</strong>
            <small>Painel da equipe</small>
          </span>
        </Link>
        <nav className="menu" aria-label="Seções do painel">
          {sections
            .filter((item) => !item.permission || me.permissions.includes(item.permission))
            .map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const count = item.count && counts ? counts[item.count] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="menu-item"
                  aria-current={active ? 'page' : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {count > 0 ? <span className="count">{count}</span> : null}
                </Link>
              );
            })}
        </nav>
        <div className="me">
          <span className="avatar" aria-hidden="true">
            {initials(me.name)}
          </span>
          <span className="me-text">
            <strong>{me.name}</strong>
            <small>{labelRole(me.role)}</small>
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => void logout()}
            aria-label="Sair"
            title="Sair"
          >
            {icons.logout}
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </header>
  );
}

/** Lista vazia: o mascote sentado esperando. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Image src="/mascote-sentado.webp" alt="" width={96} height={152} unoptimized />
      <p>{children}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-label="Carregando">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
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
  if (me === undefined)
    return (
      <main className="content">
        <Loading />
      </main>
    );
  if (!me)
    return (
      <main className="content">
        <Empty>
          Entre no painel para ver {label}. <Link href="/">Entrar</Link>
        </Empty>
      </main>
    );
  if (!me.permissions.includes(permission)) {
    return (
      <Frame me={me}>
        <Empty>Sua conta não abre {label}.</Empty>
      </Frame>
    );
  }
  return <>{children(me)}</>;
}
