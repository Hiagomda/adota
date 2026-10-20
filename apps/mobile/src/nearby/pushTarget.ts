const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O resgate que um push abre. A API manda `postId` e `url` (`egua://post/<id>`) nos dados; vale
 * o primeiro que for um id de verdade, para um dado estranho nunca virar rota.
 */
export function postIdFromPush(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.postId === 'string' && uuid.test(fields.postId)) return fields.postId;
  if (typeof fields.url === 'string') {
    const match = /^egua:\/\/post\/([^/?#]+)$/.exec(fields.url);
    if (match?.[1] && uuid.test(match[1])) return match[1];
  }
  return null;
}
