import { listPosts } from '../../lib/api';
import { statusLabel } from '../../lib/labels';
import { CityMap } from './city-map';

export const dynamic = 'force-dynamic';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ species?: string }>;
}) {
  const query = await searchParams;
  const posts = await listPosts({ species: query.species });

  return (
    <main className="page">
      <section className="intro">
        <h1>Onde estão os alertas em Belém.</h1>
        <p>Cada ponto usa a localização aproximada. Toque para ver o animal e abrir o alerta.</p>
      </section>
      <nav className="filters">
        <a href="/mapa" data-active={!query.species}>
          Todos
        </a>
        <a href="/mapa?species=dog" data-active={query.species === 'dog'}>
          Cachorros
        </a>
        <a href="/mapa?species=cat" data-active={query.species === 'cat'}>
          Gatos
        </a>
      </nav>
      <CityMap
        posts={posts.map((post) => ({
          id: post.id,
          label: post.approxLabel,
          status: statusLabel[post.status] ?? post.status,
          urgency: post.urgency,
          latitude: post.location.latitude,
          longitude: post.location.longitude,
          thumbUrl: post.media[0]?.thumbUrl ?? null,
        }))}
      />
    </main>
  );
}
