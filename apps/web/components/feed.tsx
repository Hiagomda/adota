'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Bookmark,
  Camera,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';

export interface FeedPost {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  location: string;
  image: string | null;
  title: string;
  text: string;
  likes: number;
  comments: number;
  time: string;
  status: string;
  urgency: string;
}

const filters = [
  { label: 'Todos', href: '/', type: undefined },
  { label: 'Resgates', href: '/?type=rescue_alert', type: 'rescue_alert' },
  { label: 'Perdidos', href: '/?type=lost', type: 'lost' },
  { label: 'Adoções', href: '/?type=adoption', type: 'adoption' },
  { label: 'Ajuda', href: '/?type=help_request', type: 'help_request' },
] as const;

export function Feed({
  posts,
  stories,
  activeType,
}: {
  posts: FeedPost[];
  stories: { id: string; name: string; image: string }[];
  activeType?: string;
}) {
  const [liked, setLiked] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);

  function toggle(list: string[], setList: (value: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  return (
    <div className="mx-auto w-full max-w-[480px] pt-3 pb-4">
      <div className="mb-3 flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Link href="/?type=rescue_alert" className="flex min-w-[66px] flex-col items-center gap-2">
          <span className="rounded-full bg-[#e7dce3] p-[3px]">
            <span className="flex size-[54px] items-center justify-center rounded-full border-[3px] border-[#f6f1f4] bg-[#f3e0ea] text-[#6b2454]">
              <Plus className="size-4" />
            </span>
          </span>
          <span className="max-w-[68px] truncate text-[11px] font-medium text-[#7c6574]">Novo</span>
        </Link>
        {stories.map((story) => (
          <Link
            key={story.id}
            href={`/p/${story.id}`}
            className="flex min-w-[66px] flex-col items-center gap-2"
          >
            <span className="rounded-full bg-gradient-to-br from-[#c44878] to-[#8e3a68] p-[3px]">
              <span className="block size-[54px] overflow-hidden rounded-full border-[3px] border-[#f6f1f4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={story.image} alt={story.name} className="size-full object-cover" />
              </span>
            </span>
            <span className="max-w-[68px] truncate text-[11px] font-medium text-[#7c6574]">
              {story.name}
            </span>
          </Link>
        ))}
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {filters.map((filter) => {
          const active = (filter.type ?? undefined) === activeType;
          return (
            <Link
              key={filter.label}
              href={filter.href}
              data-active={active}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-xs font-semibold ${
                active ? 'bg-[#6b2454] text-white' : 'bg-white text-[#5e4556]'
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="mb-3 border-y border-[#eadfe4] bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f3e0ea] text-xs font-bold text-[#6b2454]">
            É
          </span>
          <span className="min-w-0 flex-1 rounded-full bg-[#f6eef2] px-4 py-2.5 text-sm text-[#8f7a86]">
            O que você quer compartilhar hoje?
          </span>
          <Link
            href="/?type=rescue_alert"
            aria-label="Ver resgates"
            className="flex size-11 items-center justify-center rounded-full text-[#8e3a68]"
          >
            <Camera className="size-5" />
          </Link>
        </div>
        <div className="mt-3 flex gap-2 border-t border-[#f0e4ea] pt-3">
          <Link
            href="/?type=adoption"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[#7c6574]"
          >
            <Heart className="size-4 text-[#c43b6e]" /> Encontrar um lar
          </Link>
          <Link
            href="/?type=help_request"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[#7c6574]"
          >
            <Sparkles className="size-4 text-[#2e4e8a]" /> Pedir ajuda
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {posts.length === 0 ? (
          <p className="px-4 text-sm text-[#7c6574]">Nenhum alerta publicado por aqui ainda.</p>
        ) : (
          posts.map((post) => {
            const isLiked = liked.includes(post.id);
            const isSaved = saved.includes(post.id);
            const likes = post.likes + (isLiked ? 1 : 0);
            return (
              <article key={post.id} className="border-y border-[#eadfe4] bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Portrait
                      src={post.avatarUrl}
                      name={post.name}
                      className="size-10 shrink-0 ring-2 ring-[#f0d8e6]"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/u/${post.handle}`}
                        className="block truncate text-sm font-bold text-[#3c2434]"
                      >
                        {post.name}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[#8f7a86]">
                        <MapPin className="size-3 shrink-0" /> {post.location}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/p/${post.id}`}
                    aria-label="Abrir alerta"
                    className="flex size-11 items-center justify-center text-[#8f7a86]"
                  >
                    <MoreHorizontal className="size-5" />
                  </Link>
                </div>
                <Link href={`/p/${post.id}`} className="relative block aspect-[4/5] bg-[#eadfe4]">
                  {post.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.image}
                      alt={`${post.title} — ${post.name}`}
                      className="size-full object-cover"
                    />
                  ) : null}
                  <span className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#3c2434]">
                    {post.urgency} · {post.status}
                  </span>
                </Link>
                <div className="px-4 pt-1 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <button
                        type="button"
                        aria-label={isLiked ? 'Descurtir' : 'Curtir'}
                        onClick={() => toggle(liked, setLiked, post.id)}
                        className={`flex size-11 items-center justify-center ${isLiked ? 'text-[#c43b6e]' : 'text-[#6a5362]'}`}
                      >
                        <Heart className={`size-[22px] ${isLiked ? 'fill-current' : ''}`} />
                      </button>
                      <Link
                        href={`/p/${post.id}`}
                        aria-label="Comentar"
                        className="flex size-11 items-center justify-center text-[#6a5362]"
                      >
                        <MessageCircle className="size-[22px]" />
                      </Link>
                      <Link
                        href={`/p/${post.id}`}
                        aria-label="Compartilhar"
                        className="flex size-11 items-center justify-center text-[#6a5362]"
                      >
                        <Send className="size-[20px]" />
                      </Link>
                    </div>
                    <button
                      type="button"
                      aria-label={isSaved ? 'Remover dos salvos' : 'Salvar'}
                      onClick={() => toggle(saved, setSaved, post.id)}
                      className={`flex size-11 items-center justify-center ${isSaved ? 'text-[#2e4e8a]' : 'text-[#6a5362]'}`}
                    >
                      <Bookmark className={`size-5 ${isSaved ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <p className="text-xs font-bold text-[#5e4556]">
                    {likes === 1 ? '1 curtida' : `${likes} curtidas`}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5e4556]">
                    <strong className="font-bold text-[#3c2434]">{post.title}</strong> {post.text}
                  </p>
                  <Link
                    href={`/p/${post.id}`}
                    className="mt-2 block text-xs font-medium text-[#9a8492]"
                  >
                    Ver todos os {post.comments} comentários
                  </Link>
                  <p className="mt-3 text-[10px] font-semibold tracking-[0.1em] text-[#a8909a] uppercase">
                    {post.time}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function Portrait({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className: string;
}) {
  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-[#f3e0ea] text-xs font-bold text-[#6b2454] ${className}`}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span className={`inline-block overflow-hidden rounded-full ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-cover" />
    </span>
  );
}
