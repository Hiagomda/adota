import { describe, expect, it } from 'vitest';
import { canAskAuthorContact } from '../src/contact.js';
import type { SessionUser } from '../src/session.js';

const person = (id: string, role = 'user') => ({ id, role }) as SessionUser;

describe('canAskAuthorContact', () => {
  it('opens adoption contact to anyone signed in', () => {
    const gate = { viewer: person('a'), authorId: 'b', viewerWillHelp: false };
    expect(canAskAuthorContact({ ...gate, status: 'for_adoption' })).toBe(true);
    expect(canAskAuthorContact({ ...gate, status: 'adopted' })).toBe(true);
  });

  it('keeps a rescue contact for who said vou ajudar or the team', () => {
    const rescue = { authorId: 'b', status: 'open' };
    expect(canAskAuthorContact({ ...rescue, viewer: person('a'), viewerWillHelp: false })).toBe(
      false,
    );
    expect(canAskAuthorContact({ ...rescue, viewer: person('a'), viewerWillHelp: true })).toBe(
      true,
    );
    expect(
      canAskAuthorContact({ ...rescue, viewer: person('a', 'admin'), viewerWillHelp: false }),
    ).toBe(true);
  });

  it('never hands the author their own number', () => {
    expect(
      canAskAuthorContact({
        viewer: person('b'),
        authorId: 'b',
        status: 'for_adoption',
        viewerWillHelp: false,
      }),
    ).toBe(false);
  });
});
