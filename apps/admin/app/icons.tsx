import type { ReactNode } from 'react';

/** Ícones de traço, no tamanho do texto. Desenhos simples para não puxar biblioteca. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const icons = {
  home: (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </Icon>
  ),
  flag: (
    <Icon>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Icon>
  ),
  posts: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </Icon>
  ),
  badge: (
    <Icon>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  people: (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14.5c2.3 0 4 1.5 4.5 4" />
    </Icon>
  ),
  team: (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </Icon>
  ),
  audit: (
    <Icon>
      <path d="M8 3h8l4 4v14H4V3h4" />
      <path d="M8 11h8M8 15h8M8 7h4" />
    </Icon>
  ),
  logout: (
    <Icon>
      <path d="M15 4h4v16h-4" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </Icon>
  ),
  paw: (
    <Icon>
      <ellipse cx="12" cy="16" rx="4.5" ry="3.5" />
      <circle cx="6" cy="10" r="1.8" />
      <circle cx="18" cy="10" r="1.8" />
      <circle cx="9.5" cy="6" r="1.8" />
      <circle cx="14.5" cy="6" r="1.8" />
    </Icon>
  ),
  heart: (
    <Icon>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </Icon>
  ),
  clock: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),
  ban: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </Icon>
  ),
  sparkle: (
    <Icon>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </Icon>
  ),
  search: (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Icon>
  ),
  arrow: (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  ),
};
