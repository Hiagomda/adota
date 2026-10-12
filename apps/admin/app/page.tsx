'use client';

import { useState, type FormEvent } from 'react';
import { Frame, Loading, useStaff } from './painel';

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

  if (me === undefined) return <Loading />;
  if (me) {
    return (
      <Frame me={me}>
        <section className="card stack">
          <h1>Painel da equipe</h1>
          <p className="muted">
            Verificação de ONG, chaves Pix e denúncias entram nas próximas entregas. Aqui ficam a
            equipe e a auditoria.
          </p>
        </section>
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

  return (
    <main>
      <section className="card stack" style={{ maxWidth: 480 }}>
        <h1>Painel da equipe</h1>
        <p className="muted">
          Entre com a conta da equipe. O próximo passo é o código do autenticador. Sem esse código,
          o painel não abre.
        </p>
        {step === 'login' ? (
          <form className="stack" onSubmit={(event) => void start(event)}>
            <label>
              E-mail do ambiente de teste
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
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
              Continuar
            </button>
          </form>
        ) : null}
        {step === 'enroll' ? (
          <form className="stack" onSubmit={(event) => void confirm(event)}>
            <p>Adicione esta chave no aplicativo autenticador e digite o código de 6 dígitos.</p>
            <p>
              <strong>{secret}</strong>
            </p>
            <p className="muted">{otpauthUrl}</p>
            <label>
              Código
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              Ativar
            </button>
          </form>
        ) : null}
        {step === 'totp' ? (
          <form className="stack" onSubmit={(event) => void confirm(event)}>
            <label>
              Código do autenticador ou código de recuperação
              <input
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              Entrar
            </button>
          </form>
        ) : null}
        {step === 'codes' ? (
          <div className="stack">
            <p>
              Guarde estes códigos. Eles aparecem uma vez só e servem se você perder o autenticador.
            </p>
            <ul>
              {codes.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => window.location.assign('/')}>
              Já guardei
            </button>
          </div>
        ) : null}
        {message ? <p className="error">{message}</p> : null}
      </section>
    </main>
  );
}
