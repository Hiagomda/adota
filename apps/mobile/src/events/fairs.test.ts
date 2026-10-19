import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { directionsUrl, fairDays, fairRange, fairWhen } from './fairs.ts';

// 19/10/2026, 22h em Belém (já é dia 20 em UTC).
const now = new Date('2026-10-20T01:00:00Z');

describe('feiras de adoção', () => {
  it('oferece os dias a partir de amanhã no calendário de Belém', () => {
    const days = fairDays(now, 3);
    assert.deepEqual(
      days.map((day) => day.key),
      ['2026-10-20', '2026-10-21', '2026-10-22'],
    );
    assert.equal(days[0]?.label, 'Ter 20/10');
  });

  it('monta início e fim com o fuso de Belém, virando o dia quando precisa', () => {
    assert.deepEqual(fairRange('2026-10-24', 9, 4), {
      startsAt: '2026-10-24T09:00:00-03:00',
      endsAt: '2026-10-24T13:00:00-03:00',
    });
    assert.equal(fairRange('2026-10-24', 18, 6).endsAt, '2026-10-25T00:00:00-03:00');
  });

  it('escreve quando é a feira', () => {
    const saturday = fairRange('2026-10-24', 9, 4);
    assert.equal(fairWhen(saturday.startsAt, saturday.endsAt, now), 'Sábado, 24 out · 9h às 13h');
    const tomorrow = fairRange('2026-10-20', 15, 3);
    assert.equal(fairWhen(tomorrow.startsAt, tomorrow.endsAt, now), 'Amanhã · 15h às 18h');
    const during = new Date('2026-10-24T13:30:00Z');
    assert.equal(
      fairWhen(saturday.startsAt, saturday.endsAt, during),
      'Acontecendo agora · até 13h',
    );
  });

  it('abre o ponto no mapa', () => {
    assert.equal(
      directionsUrl({ latitude: -1.4588, longitude: -48.4878 }),
      'https://www.google.com/maps/search/?api=1&query=-1.4588,-48.4878',
    );
  });
});
