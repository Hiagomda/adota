import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  belemToday,
  custodyPeriod,
  dueLabel,
  formatDay,
  healthFormError,
  newClientKey,
  parseDayInput,
} from './passport.ts';

test('lê a data como a pessoa digita', () => {
  assert.equal(parseDayInput('12/03/2026'), '2026-03-12');
  assert.equal(parseDayInput('1/3/26'), '2026-03-01');
  assert.equal(parseDayInput('12032026'), '2026-03-12');
  assert.equal(parseDayInput('31/02/2026'), null);
  assert.equal(parseDayInput('12/2026'), null);
});

test('hoje é o dia de Belém', () => {
  assert.equal(belemToday(new Date('2026-10-28T02:00:00Z')), '2026-10-27');
});

test('mostra datas curtas', () => {
  assert.equal(formatDay('2026-03-12'), '12 mar 2026');
  assert.equal(custodyPeriod('2026-03-03T15:00:00Z', null), 'desde 3 mar 2026');
});

test('conta quanto falta para a próxima dose', () => {
  const now = new Date('2026-10-28T15:00:00Z');
  assert.equal(dueLabel('2026-10-28', now), 'vence hoje');
  assert.equal(dueLabel('2026-11-07', now), 'vence em 10 dias');
  assert.equal(dueLabel('2026-10-25', now), 'venceu há 3 dias');
});

test('valida o formulário como o servidor', () => {
  const base = {
    title: 'V10',
    occurredOn: '2026-10-01',
    nextDueOn: null,
    nextDueRaw: '',
    today: '2026-10-28',
  };
  assert.equal(healthFormError(base), null);
  assert.match(healthFormError({ ...base, occurredOn: '2026-11-01' }) ?? '', /futuro/);
  assert.match(healthFormError({ ...base, nextDueRaw: '40/40/2026' }) ?? '', /próxima dose/);
  assert.match(
    healthFormError({ ...base, nextDueOn: '2026-09-01', nextDueRaw: '01/09/2026' }) ?? '',
    /depois/,
  );
});

test('gera uma chave que o servidor aceita', () => {
  assert.match(newClientKey(), /^[a-z0-9]{20}$/);
});
