import { ImageResponse } from 'next/og';
import { getPost } from '../../../lib/api';
import { statusLabel } from '../../../lib/labels';

export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  return new ImageResponse(<Card post={post} tall={false} />, size);
}

export function Card({ post, tall }: { post: Awaited<ReturnType<typeof getPost>>; tall: boolean }) {
  const photo = post?.media[0]?.url;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#121212',
        color: '#fff',
        fontFamily: 'sans-serif',
      }}
    >
      {photo ? (
        // ImageResponse only accepts a plain img element.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={photo}
          style={{ width: '100%', height: tall ? 1280 : 760, objectFit: 'cover' }}
        />
      ) : (
        <div style={{ height: tall ? 1280 : 760, background: '#ff6b3d' }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', padding: 48, gap: 12 }}>
        <div style={{ color: '#ff6b3d', fontSize: 36, fontWeight: 700 }}>Patinha · Belém</div>
        <div style={{ fontSize: 48, fontWeight: 700 }}>{post?.approxLabel ?? 'Alerta'}</div>
        <div style={{ fontSize: 32 }}>{post ? statusLabel[post.status] : ''}</div>
      </div>
    </div>
  );
}
