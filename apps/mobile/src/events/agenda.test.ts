import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  belemDayKey,
  belemMonthKey,
  changedFields,
  eventsByDay,
  eventsPath,
  monthGrid,
  monthLabel,
  newClientKey,
  registrationLabel,
  shiftMonth,
  spotsLabel,
  stateLabel,
} from './agenda.ts';

describe('agenda de eventos', () => {
  it('monta o caminho só com os filtros escolhidos', () => {
    assert.equal(eventsPath({}), '/events');
    assert.equal(eventsPath({ period: 'upcoming' }), '/events');
    assert.equal(
      eventsPath({ category: 'neutering', period: 'week', neighborhood: 'Guamá' }),
      '/events?category=neutering&period=week&neighborhood=Guam%C3%A1',
    );
    assert.equal(
      eventsPath({
        month: '2026-11',
        period: 'week',
        near: { latitude: -1.4, longitude: -48.48, radiusKm: 5 },
      }),
      '/events?month=2026-11&latitude=-1.40000&longitude=-48.48000&radiusKm=5',
    );
  });

  it('usa o dia de Belém, não o de UTC', () => {
    // 01h UTC do dia 1º ainda é dia 31 em Belém.
    assert.equal(belemDayKey('2026-11-01T01:00:00Z'), '2026-10-31');
    assert.equal(belemMonthKey(new Date('2026-11-01T01:00:00Z')), '2026-10');
  });

  it('anda pelos meses e escreve o nome', () => {
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.equal(monthLabel('2026-11'), 'Novembro de 2026');
  });

  it('monta as semanas do mês começando no domingo', () => {
    const weeks = monthGrid('2026-11');
    // 1º/11/2026 é domingo e o mês tem 30 dias: 5 semanas.
    assert.equal(weeks.length, 5);
    assert.equal(weeks[0]?.[0]?.key, '2026-11-01');
    assert.equal(weeks[4]?.[1]?.key, '2026-11-30');
    assert.equal(weeks[4]?.[2]?.inMonth, false);
    const october = monthGrid('2026-10');
    assert.equal(october[0]?.[0]?.key, '2026-09-27');
  });

  it('agrupa os eventos pelo dia em que começam', () => {
    const days = eventsByDay([
      { startsAt: '2026-11-07T12:00:00Z' },
      { startsAt: '2026-11-08T02:00:00Z' },
      { startsAt: '2026-11-08T13:00:00Z' },
    ]);
    assert.equal(days.get('2026-11-07')?.length, 2);
    assert.equal(days.get('2026-11-08')?.length, 1);
  });

  it('explica as vagas', () => {
    assert.equal(
      spotsLabel({ capacity: null, spotsLeft: null, waitlisted: 0, registered: 0 }),
      'Inscrição livre',
    );
    assert.equal(
      spotsLabel({ capacity: 10, spotsLeft: 1, waitlisted: 0, registered: 9 }),
      'Última vaga',
    );
    assert.equal(
      spotsLabel({ capacity: 10, spotsLeft: 4, waitlisted: 0, registered: 6 }),
      '4 vagas',
    );
    assert.equal(
      spotsLabel({ capacity: 2, spotsLeft: 0, waitlisted: 3, registered: 2 }),
      'Lotado · 3 na fila',
    );
  });

  it('mostra o estado e a inscrição', () => {
    assert.equal(stateLabel({ state: 'scheduled', reviewStatus: 'pending' }), 'Esperando a equipe');
    assert.equal(stateLabel({ state: 'cancelled', reviewStatus: 'published' }), 'Cancelado');
    assert.equal(stateLabel({ state: 'scheduled', reviewStatus: 'published' }), null);
    assert.equal(
      registrationLabel({ status: 'waitlist', position: 2, confirmedAt: null, checkedInAt: null }),
      'Você é o 2º da fila',
    );
    assert.equal(
      registrationLabel({
        status: 'registered',
        position: null,
        confirmedAt: 'x',
        checkedInAt: null,
      }),
      'Presença confirmada',
    );
  });

  it('resume o que mudou', () => {
    assert.equal(changedFields(['startsAt', 'endsAt']), 'Mudou: horário');
    assert.equal(
      changedFields(['startsAt', 'placeLabel', 'capacity']),
      'Mudou: horário, lugar e vagas',
    );
    assert.equal(changedFields([]), null);
  });

  it('gera chave de envio sem caracteres estranhos', () => {
    assert.match(newClientKey(), /^[a-z0-9]{20}$/);
  });
});
