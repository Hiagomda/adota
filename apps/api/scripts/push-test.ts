import { Pool } from 'pg';
import { loadEnv } from '../src/config.js';
import { ensureFirebaseApp } from '../src/firebaseAdmin.js';

/**
 * Manda um push de teste só para os aparelhos de UMA conta, para conferir no celular sem criar
 * resgate falso. Não grava nada no banco (nem aviso em Alertas, nem limpeza de token): só envia e
 * mostra, aparelho por aparelho, se o Firebase aceitou. Nunca imprime o token.
 * Tocar no aviso abre a Central de resgates (rota conhecida pelo app desde o build 36).
 *
 * pnpm --filter @patinha/api push:test -- --handle hiago
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

async function main(): Promise<void> {
  const handle = arg('handle');
  if (!handle) {
    console.error('Uso: pnpm --filter @patinha/api push:test -- --handle <arroba da conta>');
    process.exit(2);
  }
  const env = loadEnv();
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.error('Conta de serviço do Firebase não configurada: o servidor não envia push.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const found = await pool.query<{ fcm_tokens: string[] }>(
      `SELECT fcm_tokens FROM users WHERE handle = $1 AND deleted_at IS NULL`,
      [handle.replace(/^@/, '')],
    );
    const tokens = found.rows[0]?.fcm_tokens;
    if (!tokens) {
      console.error(`Conta @${handle} não encontrada.`);
      process.exit(1);
    }
    console.log(`@${handle}: ${tokens.length} aparelho(s) com token de push.`);
    if (tokens.length === 0) return;

    await ensureFirebaseApp(env);
    const admin = await import('firebase-admin');
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'Teste do Égua, adota!',
        body: 'Se você está lendo isto, o push chegou. Toque para abrir a Central.',
      },
      data: { route: '/central' },
      android: { priority: 'high', notification: { channelId: 'avisos' } },
      apns: { headers: { 'apns-priority': '10' } },
    });
    result.responses.forEach((response, index) => {
      console.log(
        `aparelho ${index + 1}: ${response.success ? 'aceito pelo Firebase' : `erro ${response.error?.code ?? 'desconhecido'}`}`,
      );
    });
  } finally {
    await pool.end();
  }
}

await main();
