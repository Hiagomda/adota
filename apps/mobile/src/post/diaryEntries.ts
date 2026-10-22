/**
 * Turns a rescue and its updates into diary lines the screen can draw. Kept free of React
 * Native so it runs under node:test.
 */

export type DiaryTone = 'found' | 'not_found' | 'status' | 'note';

export interface DiaryLine {
  id: string;
  tone: DiaryTone;
  title: string;
  /** Text someone wrote; null for lines the server writes by itself. */
  body: string | null;
  when: string;
  handle: string;
  photo: DiaryPhoto | null;
}

export interface DiaryPhoto {
  url: string;
  thumbUrl: string;
}

interface DiarySource {
  id: string;
  /** rescue_alert, lost or adoption. Older callers leave it out and read as a rescue. */
  type?: string;
  description: string;
  createdAt: string;
  author: { name: string; handle: string };
  updates?: {
    id: string;
    description: string;
    status?: string;
    kind?: 'not_found' | 'status' | 'note';
    photo?: DiaryPhoto | null;
    createdAt: string;
    author: { name: string; handle: string };
  }[];
}

/** What each step means when it shows up in the diary, said about the person who did it. */
const stepLines: Record<string, (name: string) => string> = {
  open: (name) => `${name} reabriu o resgate`,
  on_the_way: (name) => `${name} está a caminho`,
  not_found: (name) => `${name} foi até o local e não encontrou`,
  rescued: (name) => `${name} está com o animal`,
  fostered: () => 'Foi para um lar temporário',
  for_adoption: () => 'Está pronto para adoção',
  adopted: () => 'Foi adotado',
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** A primeira linha conta como o animal chegou ao app, que muda com o tipo do post. */
function openingLine(type: string | undefined, name: string): string {
  if (type === 'adoption') return `${name} colocou para adoção`;
  if (type === 'lost') return `${name} avisou que ele sumiu`;
  return `${name} encontrou o animal na rua`;
}

export function diaryLines(post: DiarySource): DiaryLine[] {
  const lines: DiaryLine[] = [
    {
      id: post.id,
      tone: 'found',
      title: openingLine(post.type, firstName(post.author.name)),
      body: post.description,
      when: post.createdAt,
      handle: post.author.handle,
      photo: null,
    },
  ];
  for (const update of post.updates ?? []) {
    const name = firstName(update.author.name);
    const kind = update.kind ?? 'note';
    if (kind === 'not_found') {
      lines.push({
        id: update.id,
        tone: 'not_found',
        title: `${name} foi até o local e não encontrou`,
        body: null,
        when: update.createdAt,
        handle: update.author.handle,
        photo: null,
      });
    } else if (kind === 'status' && update.status && stepLines[update.status]) {
      lines.push({
        id: update.id,
        tone: 'status',
        title:
          post.type === 'lost' && update.status === 'rescued'
            ? 'Voltou para casa'
            : stepLines[update.status](name),
        body: null,
        when: update.createdAt,
        handle: update.author.handle,
        photo: null,
      });
    } else {
      lines.push({
        id: update.id,
        tone: 'note',
        title: `Nota de ${name}`,
        body: update.description,
        when: update.createdAt,
        handle: update.author.handle,
        photo: update.photo ?? null,
      });
    }
  }
  return lines;
}

/** How many people went and did not find it, for the "não encontrado" warning. */
export function notFoundVisits(post: DiarySource): number {
  return (post.updates ?? []).filter((update) => update.kind === 'not_found').length;
}
