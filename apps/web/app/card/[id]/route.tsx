import { ImageResponse } from 'next/og';
import { getPost } from '../../../lib/api';
import { statusLabel, speciesLabel } from '../../../lib/labels';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getPost(id);
  if (!post) return new Response('Alerta não encontrado', { status: 404 });
  const story = new URL(request.url).searchParams.get('format') === 'story';
  const width = 1080;
  const height = story ? 1920 : 1080;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        color: '#fff',
        fontFamily: 'sans-serif',
      }}
    >
        {post.media[0] ? (
          // ImageResponse only accepts a plain img element.
          // eslint-disable-next-line @next/next/no-img-element
          <img
          alt=""
          src={post.media[0].url}
          style={{ width: '100%', height: story ? 1280 : 720, objectFit: 'cover' }}
        />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', padding: 56, gap: 16 }}>
        <div style={{ color: '#ff6b3d', fontSize: 40, fontWeight: 700 }}>Patinha</div>
        <div style={{ fontSize: 56, fontWeight: 700 }}>
          {speciesLabel[post.animal.species] ?? 'Animal'}
        </div>
        <div style={{ fontSize: 40 }}>{post.approxLabel}</div>
        <div style={{ fontSize: 36 }}>{statusLabel[post.status]}</div>
        <div style={{ fontSize: 28, color: '#bbbbbb' }}>{`${site}/p/${post.id}`}</div>
      </div>
    </div>,
    { width, height },
  );
}
