'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bell, Heart, Home, PawPrint, Plus, Search } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

export function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const type = useSearchParams().get('type');
  const router = useRouter();
  const [query, setQuery] = useState(useSearchParams().get('q') ?? '');

  function search(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (query.trim()) params.set('q', query.trim());
    const suffix = params.toString();
    router.push(suffix ? `/?${suffix}` : '/');
  }

  return (
    <div className="min-h-screen bg-[#f6f1f4] pb-[calc(76px+env(safe-area-inset-bottom))] text-[#2c1826]">
      <header className="sticky top-0 z-20 border-b border-[#e7dce3] bg-[#f6f1f4]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[480px] items-center justify-between px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f3e0ea] text-[#6b2454]">
              <PawPrint className="size-5 fill-current" />
            </span>
            <span className="truncate font-serif text-[19px] leading-none font-bold tracking-[-0.04em] text-[#4c2340]">
              Égua, adota!
            </span>
          </Link>
          <Link
            href="/admin"
            aria-label="Moderação"
            className="relative flex size-11 items-center justify-center text-[#6a5362]"
          >
            <Bell className="size-[19px]" />
            <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-[#c43b6e]" />
          </Link>
        </div>
        <form
          onSubmit={search}
          className="mx-auto flex w-full max-w-[480px] items-center gap-2 px-4 pb-3"
        >
          <label className="flex min-h-11 w-full items-center gap-2 rounded-full bg-white px-4 text-sm text-[#8f7a86] shadow-[0_2px_12px_rgba(80,30,60,0.06)]">
            <Search className="size-4 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar um animal ou projeto"
              aria-label="Buscar um animal ou projeto"
              className="w-full bg-transparent text-[#2c1826] outline-none placeholder:text-[#8f7a86]"
            />
          </label>
        </form>
      </header>
      {children}
      <nav className="fixed right-0 bottom-0 left-0 z-20 border-t border-[#e7dce3] bg-[#f6f1f4]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex h-[66px] w-full max-w-[480px] items-center justify-around px-3">
          <Link
            href="/"
            aria-label="Início"
            className={`flex size-11 items-center justify-center ${path === '/' && !type ? 'text-[#6b2454]' : 'text-[#7c6574]'}`}
          >
            <Home className="size-5" />
          </Link>
          <Link
            href="/mapa"
            aria-label="Explorar"
            className={`flex size-11 items-center justify-center ${path === '/mapa' ? 'text-[#6b2454]' : 'text-[#7c6574]'}`}
          >
            <Search className="size-5" />
          </Link>
          <Link
            href="/?type=help_request"
            aria-label="Publicar ajuda"
            className="flex size-11 items-center justify-center rounded-full bg-[#6b2454] text-white shadow-lg"
          >
            <Plus className="size-5" />
          </Link>
          <Link
            href="/?type=adoption"
            aria-label="Adoções"
            className={`flex size-11 items-center justify-center ${type === 'adoption' ? 'text-[#6b2454]' : 'text-[#7c6574]'}`}
          >
            <Heart className="size-5" />
          </Link>
          <Link
            href="/?type=lost"
            aria-label="Perdidos"
            className={`flex size-11 items-center justify-center ${type === 'lost' ? 'text-[#6b2454]' : 'text-[#7c6574]'}`}
          >
            <PawPrint className="size-5" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
