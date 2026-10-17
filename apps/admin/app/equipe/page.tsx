'use client';

import { useEffect, useState } from 'react';
import { Empty, Frame, Loading, PageHeader, labelRole, useStaff } from '../painel';

interface Member {
  id: string;
  name: string;
  handle: string;
  role: string;
}

const choices = [
  'user',
  'protector',
  'ngo',
  'moderator',
  'support',
  'ong_reviewer',
  'finance_reviewer',
  'admin',
  'superadmin',
] as const;

export default function TeamPage() {
  const me = useStaff();
  const [team, setTeam] = useState<Member[] | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!me?.permissions.includes('team.read')) return;
    let active = true;
    void fetch('/api/team')
      .then(async (response) => {
        const body = (await response.json()) as { team?: Member[]; message?: string };
        if (!active) return;
        if (!response.ok) setMessage(body.message ?? 'Não consegui carregar a equipe.');
        else setTeam(body.team ?? []);
      })
      .catch(() => {
        if (active) setMessage('Não consegui carregar a equipe.');
      });
    return () => {
      active = false;
    };
  }, [me]);

  if (me === undefined || (me && team === null && !message))
    return (
      <main className="content">
        <Loading />
      </main>
    );
  if (!me)
    return (
      <main className="content">
        <Empty>Entre no painel para ver a equipe.</Empty>
      </main>
    );
  if (!me.permissions.includes('team.read')) {
    return (
      <Frame me={me}>
        <Empty>Sua conta não abre a equipe.</Empty>
      </Frame>
    );
  }

  async function change(member: Member, form: FormData) {
    setMessage('');
    const response = await fetch(`/api/team/${member.id}/role`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role: form.get('role'),
        expectedRole: member.role,
        justification: form.get('justification'),
        totpCode: form.get('totpCode'),
      }),
    });
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(body.message ?? 'Não consegui alterar o papel.');
      return;
    }
    window.location.reload();
  }

  return (
    <Frame me={me}>
      <PageHeader
        title="Equipe"
        subtitle="Só o superadmin muda papéis, com motivo e código do autenticador."
      />
      {message ? <p className="error">{message}</p> : null}
      {team && team.length === 0 ? <p>Ninguém da equipe encontrado.</p> : null}
      <table>
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Papel</th>
            {me.permissions.includes('team.manage') ? <th>Alterar</th> : null}
          </tr>
        </thead>
        <tbody>
          {(team ?? []).map((member) => (
            <tr key={member.id}>
              <td>
                {member.name}
                <div className="muted">@{member.handle}</div>
              </td>
              <td>{labelRole(member.role)}</td>
              {me.permissions.includes('team.manage') ? (
                <td>
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void change(member, new FormData(event.currentTarget));
                    }}
                  >
                    <select name="role" defaultValue={member.role}>
                      {choices.map((role) => (
                        <option key={role} value={role}>
                          {labelRole(role)}
                        </option>
                      ))}
                    </select>
                    <input name="justification" placeholder="Motivo" required minLength={10} />
                    <input name="totpCode" inputMode="numeric" placeholder="Código" required />
                    <button type="submit">Salvar</button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}
