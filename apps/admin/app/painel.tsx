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
