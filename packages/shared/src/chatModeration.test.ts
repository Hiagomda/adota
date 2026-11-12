import { describe, expect, it } from 'vitest';
import { chatFlagTip, scanChatMessage, wordText } from './chatModeration.js';

describe('scanChatMessage', () => {
  it('deixa passar conversa normal de adoção', () => {
    for (const text of [
      'Oi! Ele ainda está para adoção?',
      'Estou vendo aqui que ele já tomou vacina, que bom',
      'Posso conhecer ele no sábado de manhã?',
      'Moro em casa com quintal murado e tenho dois gatos castrados.',
      'Ele tem 2 anos e é muito dócil com criança',
      'Estou vendo a foto dele, que lindo',
      'tô vendo o cachorro no seu perfil',
      'vendo o perfil dela agora',
      'Qual o sexo dele?',
      'ele é gostoso de abraçar',
    ]) {
      expect(scanChatMessage(text)).toEqual({ flags: [], blocked: false });
    }
  });

  it('barra venda e Pix, mesmo disfarçados', () => {
    expect(scanChatMessage('vendo o filhote, chama')).toMatchObject({ blocked: true });
    expect(scanChatMessage('vendo filhote de pinscher')).toMatchObject({ blocked: true });
    expect(scanChatMessage('to vendendo um gatinho')).toMatchObject({ blocked: true });
    expect(scanChatMessage('Quanto custa?')).toMatchObject({ blocked: true });
    expect(scanChatMessage('sai por R$ 150')).toMatchObject({ blocked: true });
    expect(scanChatMessage('são 200 reais')).toMatchObject({ blocked: true });
    expect(scanChatMessage('me manda o p.i.x')).toMatchObject({ blocked: true, flags: ['money'] });
    expect(scanChatMessage('qual a chave p1x?')).toMatchObject({ blocked: true });
    expect(scanChatMessage('tem taxa de adoção de 50')).toMatchObject({ blocked: true });
  });

  it('sinaliza golpe sem barrar', () => {
    const scan = scanChatMessage('me passa o código que chegou no seu celular');
    expect(scan.blocked).toBe(false);
    expect(scan.flags).toContain('scam');
    expect(scanChatMessage('precisa pagar o frete da transportadora').flags).toEqual(
      expect.arrayContaining(['money', 'scam']),
    );
  });

  it('sinaliza contato fora do app', () => {
    expect(scanChatMessage('me chama no zap 91 98888-7777').flags).toEqual(['external_contact']);
    expect(scanChatMessage('meu insta é @fulano_pets').flags).toEqual(['external_contact']);
    expect(scanChatMessage('manda email pra joao@gmail.com').flags).toEqual(['external_contact']);
    expect(scanChatMessage('olha aqui https://bit.ly/xyz').flags).toContain('external_contact');
  });

  it('sinaliza ofensa, ameaça, maus-tratos e assédio', () => {
    expect(scanChatMessage('você é um idiota').flags).toEqual(['offense']);
    expect(scanChatMessage('sei onde vc mora').flags).toEqual(['threat']);
    expect(scanChatMessage('se ninguém pegar vou jogar na rua os filhotes').flags).toEqual([
      'abuse',
    ]);
    expect(scanChatMessage('quero cruzar ele com minha cadela').flags).toEqual(['abuse']);
    expect(scanChatMessage('manda uma foto sua').flags).toEqual(['harassment']);
    expect(scanChatMessage('você é gostosa').flags).toEqual(['harassment']);
  });

  it('não confunde número de idade ou data com telefone', () => {
    expect(scanChatMessage('ele nasceu em 12/10/2025 e pesa 8 kg').flags).toEqual([]);
  });
});

describe('wordText', () => {
  it('desfaz disfarces comuns', () => {
    expect(wordText('P I X')).toBe('pix');
    expect(wordText('piiiix')).toBe('pix');
    expect(wordText('Pr3ço')).toBe('preco');
  });
});

describe('chatFlagTip', () => {
  it('explica a regra sem acusar', () => {
    expect(chatFlagTip([])).toBeNull();
    expect(chatFlagTip(['external_contact'])).toMatch(/combine a visita/);
    expect(chatFlagTip(['threat'])).toMatch(/suspensão/);
  });
});
