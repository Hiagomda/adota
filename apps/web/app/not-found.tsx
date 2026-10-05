import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page">
      <h1>Não encontramos essa página.</h1>
      <p>O alerta pode ter sido removido ou o endereço está incompleto.</p>
      <p>
        <Link href="/">Voltar para os alertas de Belém</Link>
      </p>
    </main>
  );
}
