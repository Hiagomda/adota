import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadEnv } from '../src/config.js';
import { migrate } from './migrate.js';

const dogs = [
  'https://images.dog.ceo/breeds/brabancon/n02112706_2184.jpg',
  'https://images.dog.ceo/breeds/pinscher-miniature/n02107312_1608.jpg',
  'https://images.dog.ceo/breeds/eskimo/n02109961_18527.jpg',
  'https://images.dog.ceo/breeds/kelpie/n02105412_545.jpg',
  'https://images.dog.ceo/breeds/pinscher-miniature/n02107312_2203.jpg',
  'https://images.dog.ceo/breeds/otterhound/n02091635_3199.jpg',
  'https://images.dog.ceo/breeds/stbernard/n02109525_1575.jpg',
];

const cats = [
  'https://s3.us-west-2.amazonaws.com/cdn2.thecatapi.com/images/5vm.jpg',
  'https://s3.us-west-2.amazonaws.com/cdn2.thecatapi.com/images/9ke.jpg',
  'https://s3.us-west-2.amazonaws.com/cdn2.thecatapi.com/images/3to.jpg',
  'https://s3.us-west-2.amazonaws.com/cdn2.thecatapi.com/images/3b4.jpg',
  'https://s3.us-west-2.amazonaws.com/cdn2.thecatapi.com/images/0VVrCBf1l.jpg',
];

interface SeedUser {
  email: string;
  name: string;
  handle: string;
  role: 'user' | 'protector' | 'ngo' | 'admin';
  verified: boolean;
  phone: string | null;
  whatsapp: boolean;
  lng?: number;
  lat?: number;
  foster?: boolean;
}

const people: SeedUser[] = [
  {
    email: 'admin@egua.local',
    name: 'Equipe Égua, adota!',
    handle: 'admin',
    role: 'admin',
    verified: true,
    phone: null,
    whatsapp: false,
    lng: -48.49,
    lat: -1.45,
  },
  {
    email: 'patas@egua.local',
    name: 'Patas de Belém',
    handle: 'patasbelem',
    role: 'ngo',
    verified: true,
    phone: '5591988881111',
    whatsapp: true,
    lng: -48.483,
    lat: -1.452,
  },
  {
    email: 'sacramenta@egua.local',
    name: 'Protetor da Sacramenta',
    handle: 'sacramenta',
    role: 'protector',
    verified: true,
    phone: '5591988882222',
    whatsapp: true,
    lng: -48.478,
    lat: -1.418,
  },
  {
    email: 'amazonia@egua.local',
    name: 'Instituto Amazônia Animal',
    handle: 'amazoniaanimal',
    role: 'ngo',
    verified: true,
    phone: '5591988883333',
    whatsapp: true,
    lng: -48.491,
    lat: -1.461,
  },
  {
    email: 'maria@egua.local',
    name: 'Maria Souza',
    handle: 'maria',
    role: 'user',
    verified: false,
    phone: '5591991110001',
    whatsapp: true,
  },
  {
    email: 'joao@egua.local',
    name: 'João Lima',
    handle: 'joao',
    role: 'user',
    verified: false,
    phone: null,
    whatsapp: false,
    lng: -48.489,
    lat: -1.441,
    foster: true,
  },
  {
    email: 'ana@egua.local',
    name: 'Ana Ribeiro',
    handle: 'ana',
    role: 'user',
    verified: false,
    phone: '5591991110003',
    whatsapp: true,
  },
  {
    email: 'pedro@egua.local',
    name: 'Pedro Alves',
    handle: 'pedro',
    role: 'user',
    verified: false,
    phone: null,
    whatsapp: false,
    lng: -48.47,
    lat: -1.449,
    foster: true,
  },
  {
    email: 'lucia@egua.local',
    name: 'Lúcia Ferreira',
    handle: 'lucia',
    role: 'user',
    verified: false,
    phone: '5591991110005',
    whatsapp: true,
  },
];

const spots: {
  label: string;
  lng: number;
  lat: number;
  species: 'dog' | 'cat' | 'other';
  text: string;
}[] = [
  {
    label: 'Ver-o-Peso, Belém',
    lng: -48.5034,
    lat: -1.4529,
    species: 'dog',
    text: 'Cachorro magro perto da feira, mancando da pata da frente. Alguém pode resgatar?',
  },
  {
    label: 'Campina, Belém',
    lng: -48.501,
    lat: -1.456,
    species: 'cat',
    text: 'Gata com filhote debaixo de um carro na Campina. Estão com fome.',
  },
  {
    label: 'Cidade Velha, Belém',
    lng: -48.505,
    lat: -1.459,
    species: 'dog',
    text: 'Achei esse cachorro amarrado num poste. Parece assustado, mas deixa chegar perto.',
  },
  {
    label: 'Reduto, Belém',
    lng: -48.494,
    lat: -1.441,
    species: 'dog',
    text: 'Cachorro grande deitado na calçada do Reduto, com um corte na orelha.',
  },
  {
    label: 'Umarizal, Belém',
    lng: -48.489,
    lat: -1.441,
    species: 'cat',
    text: 'Gato laranja miando há horas em frente ao mercado. Não vi tutor por perto.',
  },
  {
    label: 'Nazaré, Belém',
    lng: -48.483,
    lat: -1.452,
    species: 'dog',
    text: 'Cadela dócil na praça Batista Campos, com coleira rasgada e sem plaquinha.',
  },
  {
    label: 'Batista Campos, Belém',
    lng: -48.491,
    lat: -1.461,
    species: 'dog',
    text: 'Filhote sozinho na grama. Está tremendo e aceita água.',
  },
  {
    label: 'Jurunas, Belém',
    lng: -48.492,
    lat: -1.468,
    species: 'cat',
    text: 'Gato preto ferido na pata, escondido atrás de umas caixas.',
  },
  {
    label: 'Condor, Belém',
    lng: -48.478,
    lat: -1.468,
    species: 'dog',
    text: 'Dois cachorros juntos perto do canal. Um deles não consegue apoiar a pata.',
  },
  {
    label: 'Cremação, Belém',
    lng: -48.476,
    lat: -1.455,
    species: 'other',
    text: 'Achei um coelho doméstico na calçada. Não é animal de rua, alguém perdeu?',
  },
  {
    label: 'Guamá, Belém',
    lng: -48.457,
    lat: -1.473,
    species: 'dog',
    text: 'Cachorro caramelo muito magro na avenida, correndo entre os carros.',
  },
  {
    label: 'Terra Firme, Belém',
    lng: -48.455,
    lat: -1.462,
    species: 'cat',
    text: 'Gata prenha debaixo da escada de um prédio abandonado.',
  },
  {
    label: 'Canudos, Belém',
    lng: -48.468,
    lat: -1.449,
    species: 'dog',
    text: 'Cachorro idoso deitado na sombra. Respira com dificuldade.',
  },
  {
    label: 'São Brás, Belém',
    lng: -48.47,
    lat: -1.452,
    species: 'dog',
    text: 'Perdi meu cachorro preto com mancha branca no peito. Atende por Nico.',
  },
  {
    label: 'Marco, Belém',
    lng: -48.455,
    lat: -1.432,
    species: 'cat',
    text: 'Gato cinza entrou no quintal e não quer sair. Parece perdido.',
  },
  {
    label: 'Pedreira, Belém',
    lng: -48.472,
    lat: -1.426,
    species: 'dog',
    text: 'Cachorra com mamite, andando devagar pela Pedreira. Precisa de vet.',
  },
  {
    label: 'Sacramenta, Belém',
    lng: -48.478,
    lat: -1.418,
    species: 'dog',
    text: 'Filhote atropelado, consciente, na beira da pista. Estou aqui com ele.',
  },
  {
    label: 'Telégrafo, Belém',
    lng: -48.489,
    lat: -1.425,
    species: 'dog',
    text: 'Cachorro amigável seguindo as pessoas no Telégrafo. Sem coleira.',
  },
  {
    label: 'Marambaia, Belém',
    lng: -48.445,
    lat: -1.398,
    species: 'cat',
    text: 'Gatos irmãos numa caixa de papelão. A mãe não apareceu.',
  },
  {
    label: 'Val-de-Cães, Belém',
    lng: -48.465,
    lat: -1.392,
    species: 'dog',
    text: 'Cachorro preso numa grade. Já soltei, mas ele não anda direito.',
  },
  {
    label: 'Souza, Belém',
    lng: -48.452,
    lat: -1.418,
    species: 'dog',
    text: 'Cadela que resgatamos ontem está pronta para um lar temporário.',
  },
  {
    label: 'Benguí, Belém',
    lng: -48.456,
    lat: -1.445,
    species: 'dog',
    text: 'Cachorro adotado no mês passado voltou para visita. Está bem e gordinho.',
  },
  {
    label: 'Icoaraci, Belém',
    lng: -48.452,
    lat: -1.302,
    species: 'cat',
    text: 'Gato de rua com infecção no olho, perto do mercado de Icoaraci.',
  },
  {
    label: 'Batista Campos, Belém',
    lng: -48.488,
    lat: -1.458,
    species: 'dog',
    text: 'Precisamos de ração para os 12 cães do abrigo esta semana.',
  },
  {
    label: 'Nazaré, Belém',
    lng: -48.486,
    lat: -1.45,
    species: 'dog',
    text: 'Antes e depois: o caramelo da Nazaré foi resgatado e já está no lar temporário.',
  },
];

const statuses = ['open', 'on_the_way', 'rescued', 'fostered', 'for_adoption', 'adopted'] as const;
const urgencies = ['high', 'medium', 'low'] as const;
const sizes = ['small', 'medium', 'large'] as const;

async function seed(pool: Pool): Promise<void> {
  if (process.env.SEED_IF_EMPTY === 'true') {
    const existing = await pool.query<{ n: number }>('select count(*)::int as n from users');
    if ((existing.rows[0]?.n ?? 0) > 0) return;
  }

  await pool.query(`
    TRUNCATE TABLE
      adoption_terms, verification_requests, notifications, reports, help_requests,
      fosters, story_views, blocks, post_follows, follows, saves, likes, comments,
      responses, post_media, posts, animals, users
    RESTART IDENTITY CASCADE
  `);

  const ids = new Map<string, string>();
  for (const person of people) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (
        firebase_uid, name, handle, role, verified, phone, whatsapp_opt_in, city, alert_radius_km, base_location
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'Belém', 10,
        CASE WHEN $8::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography END
      ) RETURNING id`,
      [
        `dev:${person.email}`,
        person.name,
        person.handle,
        person.role,
        person.verified,
        person.phone,
        person.whatsapp,
        person.lng ?? null,
        person.lat ?? null,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Failed to seed user');
    ids.set(person.handle, id);
    if (person.foster && person.lng !== undefined && person.lat !== undefined) {
      await pool.query(
        `INSERT INTO fosters (user_id, capacity, species_accepted, sizes_accepted, location, radius_km, available)
         VALUES ($1, 2, '{dog,cat}', '{small,medium}', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 8, true)`,
        [id, person.lng, person.lat],
      );
    }
  }

  const authors = [
    'maria',
    'joao',
    'ana',
    'pedro',
    'lucia',
    'patasbelem',
    'sacramenta',
    'amazoniaanimal',
  ];
  for (let index = 0; index < spots.length; index += 1) {
    const spot = spots[index];
    if (!spot) continue;
    const author = ids.get(authors[index % authors.length] ?? 'maria');
    const status =
      index > 19
        ? (statuses[index % statuses.length] ?? 'open')
        : index % 5 === 0
          ? 'open'
          : (statuses[index % 3] ?? 'open');
    const type =
      index === 13
        ? 'lost'
        : index === 23
          ? 'help_request'
          : index === 24
            ? 'update'
            : index === 20
              ? 'adoption'
              : 'rescue_alert';
    const urgency = urgencies[index % urgencies.length] ?? 'medium';
    const size = sizes[index % sizes.length] ?? 'medium';
    const photo = spot.species === 'cat' ? cats[index % cats.length] : dogs[index % dogs.length];
    const animal = await pool.query<{ id: string }>(
      `INSERT INTO animals (species, size, sex, age_estimate, status, current_owner_id)
       VALUES ($1, $2, 'unknown', $3, $4, $5) RETURNING id`,
      [
        spot.species,
        size,
        index % 2 === 0 ? 'adulto' : 'filhote',
        status,
        status === 'adopted' ? author : null,
      ],
    );
    const animalId = animal.rows[0]?.id;
    if (!animalId || !author || !photo) throw new Error('Failed to seed animal');
    const post = await pool.query<{ id: string }>(
      `INSERT INTO posts (author_id, animal_id, type, urgency, description, location, approx_label, status, boosted)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9, $10)
       RETURNING id`,
      [
        author,
        animalId,
        type,
        urgency,
        spot.text,
        spot.lng,
        spot.lat,
        spot.label,
        status,
        index === 16,
      ],
    );
    const postId = post.rows[0]?.id;
    if (!postId) throw new Error('Failed to seed post');
    await pool.query(
      `INSERT INTO post_media (post_id, url, type, position) VALUES ($1, $2, 'image', 0)`,
      [postId, photo],
    );
    if (status === 'on_the_way') {
      const helper = ids.get('joao');
      if (helper && helper !== author) {
        await pool.query(
          `INSERT INTO responses (post_id, user_id, kind, note) VALUES ($1, $2, 'will_help', 'Estou a caminho.')`,
          [postId, helper],
        );
      }
    }
    if (type === 'help_request') {
      await pool.query(
        `INSERT INTO help_requests (post_id, kind, goal_amount, pix_key, deadline)
         VALUES ($1, 'food', 400, 'patasbelem@egua.local', now() + interval '10 days')`,
        [postId],
      );
    }
    if (index % 4 === 0) {
      const fan = ids.get('ana');
      if (fan) {
        await pool.query(
          `INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fan, postId],
        );
        await pool.query(
          `INSERT INTO comments (post_id, user_id, body) VALUES ($1, $2, 'Vi esse animal hoje cedo. Ainda está no mesmo lugar.')`,
          [postId, fan],
        );
      }
    }
  }
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await migrate(pool);
    await seed(pool);
  } finally {
    await pool.end();
  }
}
