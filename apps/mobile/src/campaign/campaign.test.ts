import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campaignFormError,
  deadlineLabel,
  entryFormError,
  formatCents,
  goalProgress,
  moneyInputValue,
  parseMoneyInput,
} from './campaign.ts';

test('lê o valor como a pessoa digita', () => {
  assert.equal(parseMoneyInput('150'), 15_000);
  assert.equal(parseMoneyInput('150,5'), 15_050);
  assert.equal(parseMoneyInput('1.500,00'), 150_000);
  assert.equal(parseMoneyInput('R$ 1.500,00'), 150_000);
  assert.equal(parseMoneyInput('1500.00'), 150_000);
  assert.equal(parseMoneyInput('1.500'), 150_000);
  assert.equal(parseMoneyInput('0,00'), null);
  assert.equal(parseMoneyInput('dez'), null);
  assert.equal(parseMoneyInput('1,5,0'), null);
  assert.equal(parseMoneyInput(''), null);
});

test('mostra reais com centavos', () => {
  assert.equal(formatCents(150_000), 'R$ 1.500,00');
  assert.equal(moneyInputValue(5_050), '50,50');
});

test('o progresso fica entre 0 e 1', () => {
  assert.equal(goalProgress(5_000, 10_000), 0.5);
  assert.equal(goalProgress(20_000, 10_000), 1);
  assert.equal(goalProgress(0, 0), 0);
});

test('conta o prazo no calendário', () => {
  assert.equal(deadlineLabel('2026-10-27', '2026-10-27'), 'último dia');
  assert.equal(deadlineLabel('2026-11-08', '2026-10-27'), 'faltam 12 dias');
  assert.equal(deadlineLabel('2026-10-24', '2026-10-27'), 'terminou há 3 dias');
});

test('valida a campanha com as regras do servidor', () => {
  const base = {
    title: 'Cirurgia da Mel',
    purpose: 'A Mel quebrou a pata e precisa de cirurgia e internação.',
    goalCents: 150_000,
    deadline: '2026-11-30',
    pixKey: 'pix@ong.org',
    today: '2026-10-27',
  };
  assert.equal(campaignFormError(base), null);
  assert.match(campaignFormError({ ...base, purpose: 'Ajuda' }) ?? '', /30 letras/);
  assert.match(campaignFormError({ ...base, goalCents: 500 }) ?? '', /mínima/);
  assert.match(campaignFormError({ ...base, deadline: '2026-10-26' }) ?? '', /passado/);
  assert.match(campaignFormError({ ...base, deadline: '2027-12-01' }) ?? '', /um ano/);
});

test('lançamento do responsável precisa de comprovante', () => {
  const base = {
    amountCents: 3_500,
    occurredOn: '2026-10-27',
    today: '2026-10-27',
    description: 'Raio-x',
    needsReceipt: true,
    hasReceipt: false,
  };
  assert.match(entryFormError(base) ?? '', /comprovante/);
  assert.equal(entryFormError({ ...base, hasReceipt: true }), null);
  assert.match(entryFormError({ ...base, occurredOn: '2026-10-28' }) ?? '', /futuro/);
});
