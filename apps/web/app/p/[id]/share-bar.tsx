'use client';

export function ShareBar({ id, title }: { id: string; title: string }) {
  async function shareLink() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
  }

  return (
    <div className="actions">
      <a href={`patinha://post/${id}`}>Abrir no app</a>
      <a
        className="secondary"
        href={`intent://post/${id}#Intent;scheme=patinha;package=app.patinha.mobile;end`}
      >
        Android
      </a>
      <button className="secondary" type="button" onClick={() => void shareLink()}>
        Compartilhar
      </button>
      <a className="secondary" href={`/card/${id}?format=story`}>
        Card stories
      </a>
      <a className="secondary" href={`/card/${id}?format=square`}>
        Card quadrado
      </a>
    </div>
  );
}
