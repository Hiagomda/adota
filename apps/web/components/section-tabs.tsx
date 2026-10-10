'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const tabs = [
  { label: 'Todos', href: '/', kind: 'home' },
  { label: 'Resgates', href: '/?type=rescue_alert', kind: 'rescue_alert' },
  { label: 'Perdidos', href: '/?type=lost', kind: 'lost' },
  { label: 'Adoções', href: '/?type=adoption', kind: 'adoption' },
  { label: 'Adoção responsável', href: '/adocao-responsavel', kind: 'guide' },
  { label: 'Ajuda', href: '/?type=help_request', kind: 'help_request' },
] as const;

export function SectionTabs() {
  const path = usePathname();
  const type = useSearchParams().get('type');

  return (
    <div className="mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active =
          tab.kind === 'guide'
            ? path === '/adocao-responsavel'
            : path === '/' && (tab.kind === 'home' ? !type : type === tab.kind);
        return (
          <Link
            key={tab.label}
            href={tab.href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-xs font-semibold ${
              active ? 'bg-[#6b2454] text-white' : 'bg-white text-[#5e4556]'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
