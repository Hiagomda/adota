import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { channels, channelUrl, draftReady, reportText } from './guide.ts';

const empty = { what: '', where: '', when: '', animal: '' };

describe('como denunciar maus-tratos', () => {
  it('liga para o número certo e abre o site da Delegacia Virtual', () => {
    assert.deepEqual(
      channels.map((channel) => channelUrl(channel.action)),
      ['tel:190', 'tel:181', 'https://www.delegaciavirtual.pa.gov.br'],
    );
  });

  it('pede o que aconteceu e onde antes de montar o relato', () => {
    assert.equal(draftReady(empty), false);
    assert.equal(draftReady({ ...empty, what: 'Cachorro preso sem água', where: '' }), false);
    assert.equal(
      draftReady({ ...empty, what: 'Cachorro preso sem água', where: 'Rua dos Mundurucus' }),
      true,
    );
  });

  it('monta o relato só com o que foi preenchido', () => {
    assert.equal(
      reportText({
        what: '  Cachorro preso\n numa corrente curta, sem água  ',
        where: 'Rua dos Mundurucus, perto da feira, Guamá',
        when: '',
        animal: 'Vira-lata caramelo',
      }),
      [
        'Denúncia de maus-tratos a animal',
        'O que aconteceu: Cachorro preso numa corrente curta, sem água',
        'Onde: Rua dos Mundurucus, perto da feira, Guamá',
        'Animal: Vira-lata caramelo',
      ].join('\n'),
    );
  });
});
