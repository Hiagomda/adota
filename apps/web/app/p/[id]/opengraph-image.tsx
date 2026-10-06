import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import { getPost } from '../../../lib/api';
import { statusLabel } from '../../../lib/labels';

export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const qr = await QRCode.toDataURL(`${site}/p/${id}`, { margin: 1, width: 280 });
  return new ImageResponse(<Card post={post} qr={qr} tall={false} />, size);
}

export function Card({
  post,
  qr,
  tall,
}: {
  post: Awaited<ReturnType<typeof getPost>>;
  qr: string;
  tall: boolean;
}) {
  const photo = post?.media[0]?.url;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#173B3F',
        color: '#F3E8D2',
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
        <div style={{ height: tall ? 1280 : 760, background: '#F26B4F' }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', padding: 48, gap: 12 }}>
        <div style={{ color: '#F7B84B', fontSize: 36, fontWeight: 700 }}>Égua, adota! · Belém</div>
        <div style={{ fontSize: 48, fontWeight: 700 }}>{post?.approxLabel ?? 'Alerta'}</div>
        <div style={{ fontSize: 32 }}>{post ? statusLabel[post.status] : ''}</div>
        <div style={{ display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={qr} width={140} height={140} />
        </div>
      </div>
    </div>
  );
}
