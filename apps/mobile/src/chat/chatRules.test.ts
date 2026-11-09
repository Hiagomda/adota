import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatNoticePoints, chatReportReasons, lastLine } from './chatRules.ts';

test('o aviso diz que a conversa é monitorada', () => {
  assert.ok(chatNoticePoints.some((point) => point.includes('monitoradas')));
  assert.ok(chatReportReasons.length > 3);
});

test('a última linha marca a mensagem da própria pessoa', () => {
  assert.equal(lastLine({ lastBody: null }), 'Conversa aberta');
  assert.equal(lastLine({ lastBody: 'Oi', lastMine: true }), 'Você: Oi');
  assert.equal(lastLine({ lastBody: 'Oi', lastMine: false }), 'Oi');
});
