import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diaryLines, firstName, notFoundVisits } from './diaryEntries.ts';

const ana = { name: 'Ana Ribeiro', handle: 'ana' };
const joao = { name: 'João Lima', handle: 'joao' };

const post = {
  id: 'p1',
  description: 'Gatos numa caixa de papelão.',
  createdAt: '2026-10-16T10:00:00.000Z',
  author: ana,
  updates: [
    {
      id: 'u1',
      description: 'Alguém está a caminho.',
      status: 'on_the_way',
      kind: 'status' as const,
      createdAt: '2026-10-16T10:05:00.000Z',
      author: joao,
    },
    {
      id: 'u2',
      description: 'Não encontrei o animal.',
      status: 'on_the_way',
      kind: 'not_found' as const,
      createdAt: '2026-10-16T10:40:00.000Z',
      author: joao,
    },
    {
      id: 'u3',
      description: 'Deixei ração no muro.',
      status: 'on_the_way',
      kind: 'note' as const,
      createdAt: '2026-10-16T10:45:00.000Z',
      author: joao,
    },
  ],
};

test('opens with who found the animal and what they wrote', () => {
  const [first] = diaryLines(post);
  assert.equal(first?.tone, 'found');
  assert.equal(first?.title, 'Ana encontrou o animal na rua');
  assert.equal(first?.body, 'Gatos numa caixa de papelão.');
});

test('says in words who is going and who did not find it', () => {
  const lines = diaryLines(post);
  assert.equal(lines[1]?.title, 'João está a caminho');
  assert.equal(lines[1]?.body, null);
  assert.equal(lines[2]?.tone, 'not_found');
  assert.equal(lines[2]?.title, 'João foi até o local e não encontrou');
  assert.equal(lines[3]?.title, 'Nota de João');
  assert.equal(lines[3]?.body, 'Deixei ração no muro.');
});

test('an update from an older API is a plain note', () => {
  const [, line] = diaryLines({
    ...post,
    updates: [{ id: 'u9', description: 'Oi', createdAt: post.createdAt, author: joao }],
  });
  assert.equal(line?.tone, 'note');
});

test('counts the visits that did not find it', () => {
  assert.equal(notFoundVisits(post), 1);
  assert.equal(notFoundVisits({ ...post, updates: undefined }), 0);
});

test('takes the first name', () => {
  assert.equal(firstName('  Maria   Souza '), 'Maria');
  assert.equal(firstName('Lucia'), 'Lucia');
});

test('the first line follows the kind of post, and a lost pet goes home', () => {
  const base = {
    id: 'p',
    description: 'Sumiu ontem.',
    createdAt: '2026-10-01T10:00:00Z',
    author: { name: 'Ana Souza', handle: 'ana' },
  };
  assert.equal(diaryLines({ ...base, type: 'adoption' })[0]?.title, 'Ana colocou para adoção');
  const lost = diaryLines({
    ...base,
    type: 'lost',
    updates: [
      {
        id: 'u',
        description: 'Voltou para casa.',
        status: 'rescued',
        kind: 'status',
        createdAt: '2026-10-02T10:00:00Z',
        author: { name: 'Ana Souza', handle: 'ana' },
      },
    ],
  });
  assert.equal(lost[0]?.title, 'Ana avisou que ele sumiu');
  assert.equal(lost[1]?.title, 'Voltou para casa');
});
