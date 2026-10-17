'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { icons } from './icons';
import { Frame, Loading, useModeration, useStaff, type StaffMe } from './painel';

type Step = 'login' | 'enroll' | 'totp' | 'codes';

export default function HomePage() {
  const me = useStaff();
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [firebaseToken, setFirebaseToken] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (me === undefined)
    return (
      <main className="content">
        <Loading />
      </main>
    );
  if (me) {
    return (
      <Frame me={me}>
        <Overview me={me} />
      </Frame>
    );
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        firebaseToken.trim()
          ? { firebaseToken: firebaseToken.trim() }
          : { devToken: `dev:${email.trim()}` },
      ),
    });
    const body = (await response.json()) as { step?: Step; message?: string };
    setBusy(false);
    if (!response.ok || (body.step !== 'enroll' && body.step !== 'totp')) {
      setMessage(body.message ?? 'Não consegui entrar.');
      return;
    }
    setStep(body.step);
    if (body.step === 'enroll') {
      const enroll = await fetch('/api/totp/enroll', { method: 'POST' });
      const enrollBody = (await enroll.json()) as {
        secret?: string;
        otpauthUrl?: string;
        message?: string;
      };
      if (!enroll.ok || !enrollBody.secret) {
        setMessage(enrollBody.message ?? 'Não consegui preparar o autenticador.');
        return;
      }
      setSecret(enrollBody.secret);
      setOtpauthUrl(enrollBody.otpauthUrl ?? '');
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const path = step === 'enroll' ? '/api/totp/confirm' : '/api/totp/session';
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await response.json()) as { recoveryCodes?: string[]; message?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(body.message ?? 'Código inválido.');
      return;
    }
    if (body.recoveryCodes) {
      setCodes(body.recoveryCodes);
      setStep('codes');
      return;
    }
    window.location.assign('/');
  }

  const stepIndex = { login: 0, enroll: 1, totp: 1, codes: 2 }[step];

  return (
    <main className="login">
      <section className="login-art">
        <Image
          src="/mascote-acenando.webp"
          alt="Mascote do Égua, adota!, um vira-lata caramelo acenando"
          width={220}
          height={252}
          priority
          unoptimized
        />
        <h1>Égua, adota!</h1>
        <p>Painel da equipe: denúncias, posts, ONGs e pessoas do app, num lugar só.</p>
      </section>
      <section className="login-form">
        <div className="card">
          <div className="steps" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span key={index} className={index <= stepIndex ? 'done' : undefined} />
            ))}
          </div>
          {step === 'login' ? (
            <form className="stack" onSubmit={(event) => void start(event)}>
              <h2>Entrar</h2>
              <p className="muted">
                Use a conta da equipe. Depois vem o código do autenticador. Sem esse código, o
                painel não abre.
              </p>
              <label>
                E-mail do ambiente de teste
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  placeholder="voce@egua.local"
                />
              </label>
              <label>
                Token do Firebase
                <textarea
                  value={firebaseToken}
                  onChange={(event) => setFirebaseToken(event.target.value)}
                  rows={3}
                />
              </label>
              <button type="submit" disabled={busy}>
                Continuar {icons.arrow}
              </button>
            </form>
          ) : null}
          {step === 'enroll' ? (
            <form className="stack" onSubmit={(event) => void confirm(event)}>
              <h2>Ative o autenticador</h2>
              <p className="muted">
                Adicione esta chave no aplicativo autenticador e digite o código de 6 dígitos.
              </p>
              <div className="secret">{secret}</div>
              <p className="muted">
                <code>{otpauthUrl}</code>
              </p>
              <label>
                Código
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="000000"
                />
              </label>
              <button type="submit" disabled={busy}>
                Ativar
              </button>
            </form>
          ) : null}
          {step === 'totp' ? (
            <form className="stack" onSubmit={(event) => void confirm(event)}>
              <h2>Código do autenticador</h2>
              <label>
                Código do autenticador ou código de recuperação
                <input
                  inputMode="text"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="000000"
                />
              </label>
              <button type="submit" disabled={busy}>
                Entrar {icons.arrow}
              </button>
            </form>
          ) : null}
          {step === 'codes' ? (
            <div className="stack">
              <h2>Códigos de recuperação</h2>
              <p className="muted">
                Guarde estes códigos. Eles aparecem uma vez só e servem se você perder o
                autenticador.
              </p>
              <ul className="codes">
                {codes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button type="button" onClick={() => window.location.assign('/')}>
                Já guardei
              </button>
            </div>
          ) : null}
          {message ? <p className="error">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}

interface OverviewData {
  usersTotal: number;
  usersThisWeek: number;
  usersSuspended: number;
  postsThisWeek: number;
  alertsOpen: number;
  adopted: number;
  pendingReview: number;
  openReports: number;
  pendingVerifications: number;
  meanSecondsToResponse: number | null;
}

function minutes(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1).replace('.', ',')} h`;
}

function Stat({
  icon,
  tone,
  value,
  label,
}: {
  icon: ReactNode;
  tone?: 'coral' | 'caramel';
  value: string;
  label: string;
}) {
  return (
    <div className="card stat">
      <span className={`stat-icon${tone ? ` ${tone}` : ''}`}>{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function Overview({ me }: { me: StaffMe }) {
  const allowed = me.permissions.includes('overview.read');
  const { data, message } = useModeration<OverviewData>(allowed ? 'overview' : null);
  const firstName = me.name.split(' ')[0] ?? me.name;
  const hero = (pending: number | null) => (
    <section className="hero">
      <div className="stack">
        <h1>
          {greeting()}, {firstName}!
        </h1>
        <p>
          {pending === null
            ? 'Sua conta abre a equipe e a auditoria.'
            : pending === 0
              ? 'Nada esperando a equipe agora. Os bichos agradecem.'
              : `Tem ${pending} ${pending === 1 ? 'coisa esperando' : 'coisas esperando'} a equipe.`}
        </p>
      </div>
      <Image src="/mascote-acenando.webp" alt="" width={150} height={172} unoptimized />
    </section>
  );
  if (!allowed) return hero(null);
  if (message) return <p className="error">{message}</p>;
  if (!data) return <Loading />;
  const queue = [
    {
      label: 'Denúncias abertas',
      value: data.openReports,
      href: '/denuncias',
      permission: 'reports.manage',
      icon: icons.flag,
    },
    {
      label: 'Posts esperando revisão',
      value: data.pendingReview,
      href: '/posts',
      permission: 'posts.moderate',
      icon: icons.posts,
    },
    {
      label: 'Pedidos de verificação',
      value: data.pendingVerifications,
      href: '/verificacoes',
      permission: 'verifications.manage',
      icon: icons.badge,
    },
  ];
  const pending = queue
    .filter((item) => me.permissions.includes(item.permission))
    .reduce((total, item) => total + item.value, 0);
  return (
    <>
      {hero(pending)}
      <h2 className="section-title">Fila de trabalho</h2>
      <div className="grid tasks">
        {queue.map((item) => {
          const body = (
            <>
              <span className={`stat-icon${item.value > 0 ? ' coral' : ''}`}>{item.icon}</span>
              <span className="task-text">
                <strong>{item.value}</strong>
                <span className="muted">{item.label}</span>
              </span>
              {me.permissions.includes(item.permission) ? (
                <span className="arrow">{icons.arrow}</span>
              ) : null}
            </>
          );
          const className = `card task${item.value > 0 ? ' attention' : ''}`;
          return me.permissions.includes(item.permission) ? (
            <Link key={item.label} href={item.href} className={className}>
              {body}
            </Link>
          ) : (
            <div key={item.label} className={className}>
              {body}
            </div>
          );
        })}
      </div>
      <h2 className="section-title">Números do app</h2>
      <div className="grid">
        <Stat icon={icons.people} value={String(data.usersTotal)} label="Pessoas cadastradas" />
        <Stat
          icon={icons.sparkle}
          tone="caramel"
          value={String(data.usersThisWeek)}
          label="Novas nos últimos 7 dias"
        />
        <Stat
          icon={icons.posts}
          value={String(data.postsThisWeek)}
          label="Posts nos últimos 7 dias"
        />
        <Stat
          icon={icons.paw}
          tone="coral"
          value={String(data.alertsOpen)}
          label="Resgates em aberto"
        />
        <Stat
          icon={icons.heart}
          tone="coral"
          value={String(data.adopted)}
          label="Adoções concluídas"
        />
        <Stat
          icon={icons.clock}
          tone="caramel"
          value={minutes(data.meanSecondsToResponse)}
          label='Tempo médio até "vou ajudar" (30 dias)'
        />
        <Stat icon={icons.ban} value={String(data.usersSuspended)} label="Contas suspensas" />
      </div>
    </>
  );
}
