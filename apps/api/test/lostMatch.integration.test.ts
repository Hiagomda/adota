import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { bmpPixels } from '../src/lostMatch.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, phone, whatsapp_opt_in)
     VALUES ($1, $2, $2, 'user', 'Belém', '+5591988887777', true) RETURNING id`,
    [`dev:${email}`, handle],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('busca de animais perdidos', () => {
  let app: FastifyInstance;

  async function publish(email: string, payload: Record<string, unknown>): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        sex: 'female',
        urgency: 'medium',
        latitude: -1.4523,
        longitude: -48.4832,
        approxLabel: 'Nazaré, Belém',
        media: [],
        ...payload,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  const refresh = (postId: string, email: string) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/matches/refresh`,
      headers: auth(email),
    });
  const matches = (postId: string, email: string) =>
    app.inject({ method: 'GET', url: `/posts/${postId}/matches`, headers: auth(email) });
  const decide = (matchId: string, decision: string, email: string) =>
    app.inject({
      method: 'POST',
      url: `/lost-matches/${matchId}/${decision}`,
      headers: auth(email),
    });

  async function scenario() {
    await insertUser('tutor@egua.local', 'tutor');
    await insertUser('achou@egua.local', 'achou');
    await insertUser('outro@egua.local', 'outro');
    const lostId = await publish('tutor@egua.local', {
      type: 'lost',
      name: 'Pipoca',
      colors: ['caramel', 'white'],
      description: 'Sumiu a Pipoca, cadela caramelo com coleira vermelha. Atende pelo nome.',
    });
    // A uns 900 m, no dia seguinte (mesmo dia no teste), com coleira.
    const foundId = await publish('achou@egua.local', {
      type: 'rescue_alert',
      colors: ['caramel'],
      description: 'Cadela caramelo de coleira andando sozinha perto do mercado.',
      latitude: -1.4443,
      longitude: -48.4832,
    });
    const catId = await publish('outro@egua.local', {
      type: 'rescue_alert',
      species: 'cat',
      colors: ['caramel'],
      description: 'Gato caramelo com coleira.',
    });
    return { lostId, foundId, catId };
  }

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        lost_matches, post_photo_palettes, sightings, notifications, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('guarda as cores e recusa cor que não existe', async () => {
    const { lostId } = await scenario();
    const post = await app.inject({ method: 'GET', url: `/posts/${lostId}` });
    expect(post.json().animal.colors).toEqual(['caramel', 'white']);
    const bad = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('tutor@egua.local'),
      payload: {
        type: 'lost',
        species: 'dog',
        size: 'small',
        urgency: 'low',
        description: 'Teste',
        latitude: -1.4523,
        longitude: -48.4832,
        approxLabel: 'Nazaré, Belém',
        media: [],
        colors: ['roxo'],
      },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('cruza o perdido com o encontrado parecido, explica a nota e avisa os dois', async () => {
    const { lostId, foundId, catId } = await scenario();
    const refreshed = await refresh(lostId, 'tutor@egua.local');
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().found).toBe(1);

    const forTutor = (await matches(lostId, 'tutor@egua.local')).json();
    expect(forTutor.side).toBe('lost');
    expect(forTutor.searching).toBe(true);
    expect(forTutor.matches).toHaveLength(1);
    const [match] = forTutor.matches;
    expect(match.post.id).toBe(foundId);
    expect(match.post.id).not.toBe(catId);
    expect(match.score).toBeGreaterThanOrEqual(65);
    expect(match.distanceKm).toBe(0.5);
    const codes = match.reasons.map((reason: { code: string }) => reason.code);
    expect(codes).toEqual(expect.arrayContaining(['size', 'colors', 'distance', 'marks', 'sex']));
    // Nada de telefone nem ponto exato na sugestão.
    expect(JSON.stringify(match)).not.toContain('98888');
    expect(match.post.location).toBeUndefined();

    const finder = (await matches(foundId, 'achou@egua.local')).json();
    expect(finder.side).toBe('found');
    expect(finder.matches[0].post.id).toBe(lostId);

    const notes = await pool.query<{ handle: string; type: string; route: string }>(
      `SELECT u.handle, n.type, n.payload->>'route' AS route
       FROM notifications n JOIN users u ON u.id = n.user_id ORDER BY u.handle`,
    );
    expect(notes.rows).toEqual([
      { handle: 'achou', type: 'lost_match', route: `/lost-matches/${foundId}` },
      { handle: 'tutor', type: 'lost_match', route: `/lost-matches/${lostId}` },
    ]);

    // Procurar de novo não avisa outra vez.
    await refresh(foundId, 'achou@egua.local');
    const again = await pool.query(`SELECT 1 FROM notifications`);
    expect(again.rowCount).toBe(2);
  });

  it('só quem publicou vê as sugestões; só o tutor confirma', async () => {
    const { lostId } = await scenario();
    await refresh(lostId, 'tutor@egua.local');
    expect((await matches(lostId, 'outro@egua.local')).statusCode).toBe(403);
    expect((await refresh(lostId, 'outro@egua.local')).statusCode).toBe(403);
    const matchId = (await matches(lostId, 'tutor@egua.local')).json().matches[0].id as string;

    expect((await decide(matchId, 'confirm', 'achou@egua.local')).statusCode).toBe(403);
    expect((await decide(matchId, 'dismiss', 'outro@egua.local')).statusCode).toBe(403);
    const confirmed = await decide(matchId, 'confirm', 'tutor@egua.local');
    expect(confirmed.json().status).toBe('confirmed');
    const told = await pool.query(
      `SELECT 1 FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE u.handle = 'achou' AND n.type = 'lost_match_confirmed'`,
    );
    expect(told.rowCount).toBe(1);
  });

  it('quem encontrou pode descartar, e a sugestão some para os dois', async () => {
    const { lostId, foundId } = await scenario();
    await refresh(lostId, 'tutor@egua.local');
    const matchId = (await matches(foundId, 'achou@egua.local')).json().matches[0].id as string;
    expect((await decide(matchId, 'dismiss', 'achou@egua.local')).json().status).toBe('dismissed');
    expect((await matches(lostId, 'tutor@egua.local')).json().matches).toHaveLength(0);
    // Recalcular não ressuscita a sugestão descartada.
    await refresh(lostId, 'tutor@egua.local');
    expect((await matches(lostId, 'tutor@egua.local')).json().matches).toHaveLength(0);
  });

  it('usa o avistamento do encontrado para medir a distância', async () => {
    const { lostId } = await scenario();
    const farId = await publish('outro@egua.local', {
      type: 'rescue_alert',
      colors: ['caramel'],
      description: 'Cadela caramelo de coleira.',
      latitude: -1.3683,
      longitude: -48.4532,
    });
    const before = (await refresh(lostId, 'tutor@egua.local')).json().matches;
    const farBefore = before.find((m: { post: { id: string } }) => m.post.id === farId);
    await pool.query(
      `INSERT INTO sightings (post_id, user_id, location)
       SELECT $1, id, ST_SetSRID(ST_MakePoint(-48.4832, -1.4500), 4326)::geography
       FROM users WHERE handle = 'tutor'`,
      [farId],
    );
    const after = (await refresh(lostId, 'tutor@egua.local')).json().matches;
    const farAfter = after.find((m: { post: { id: string } }) => m.post.id === farId);
    expect(farAfter.distanceKm).toBeLessThan(1);
    expect(farAfter.score).toBeGreaterThan(farBefore?.score ?? 0);
  });

  it('para de sugerir quando o perdido volta para casa', async () => {
    const { lostId, foundId } = await scenario();
    await refresh(lostId, 'tutor@egua.local');
    await pool.query(`UPDATE posts SET status = 'rescued' WHERE id = $1`, [lostId]);
    expect((await matches(foundId, 'achou@egua.local')).json().matches).toHaveLength(0);
    expect((await matches(lostId, 'tutor@egua.local')).json().searching).toBe(false);
  });

  it('quem encontrou procura entre os perdidos sem entrar na conta', async () => {
    const { lostId } = await scenario();
    const search = await app.inject({
      method: 'GET',
      url: '/lost-search?species=dog&colors=caramel&size=medium&latitude=-1.4443&longitude=-48.4832&text=coleira',
    });
    expect(search.statusCode).toBe(200);
    const [first] = search.json().results;
    expect(first.post.id).toBe(lostId);
    expect(first.post.location.exact).toBe(false);
    expect(JSON.stringify(first)).not.toContain('98888');
    const cats = await app.inject({
      method: 'GET',
      url: '/lost-search?species=cat&latitude=-1.4443&longitude=-48.4832',
    });
    expect(cats.json().results).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: '/lost-search?species=dog' })).statusCode).toBe(
      400,
    );
  });

  it('gera o cartaz do perdido sem contato pessoal', async () => {
    const { lostId, catId } = await scenario();
    const poster = await app.inject({ method: 'GET', url: `/posts/${lostId}/poster` });
    expect(poster.statusCode).toBe(200);
    expect(poster.headers['content-type']).toContain('text/html');
    expect(poster.body).toContain('PROCURA-SE');
    expect(poster.body).toContain('Pipoca');
    expect(poster.body).toContain('caramelo, branco');
    expect(poster.body).toContain(`?post=${lostId}`);
    expect(poster.body).toContain('<svg');
    expect(poster.body).not.toContain('98888');
    const found = await app.inject({ method: 'GET', url: `/posts/${catId}/poster` });
    expect(found.body).toContain('ENCONTRADO');
    await pool.query(`UPDATE posts SET description = '<script>x</script>' WHERE id = $1`, [catId]);
    const escaped = await app.inject({ method: 'GET', url: `/posts/${catId}/poster` });
    expect(escaped.body).not.toContain('<script>x');
  });
});

describe('bmpPixels', () => {
  it('lê uma miniatura de 24 bits de baixo para cima com preenchimento', () => {
    // 2×1 pontos: azul e vermelho, linha de 6 bytes preenchida até 8.
    const bytes = new Uint8Array(54 + 8);
    const view = new DataView(bytes.buffer);
    bytes[0] = 0x42;
    bytes[1] = 0x4d;
    view.setUint32(10, 54, true);
    view.setInt32(18, 2, true);
    view.setInt32(22, 1, true);
    view.setUint16(28, 24, true);
    bytes.set([255, 0, 0, 0, 0, 255], 54);
    expect(bmpPixels(bytes)).toEqual([0, 0, 255, 255, 0, 0]);
    expect(() => bmpPixels(new Uint8Array(10))).toThrow();
  });
});
