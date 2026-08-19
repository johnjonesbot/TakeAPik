import { getAlbumCoverUrl } from "@/lib/album-cover";

export const dynamic = "force-dynamic";

/**
 * Every album surface (login, gallery, upload, my-uploads, invite, admin)
 * gets the event's cover photo as an atmospheric backdrop: heavily blurred,
 * 20% opacity, layered over the dark base so contrast is unaffected.
 */
export default async function AlbumLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const coverUrl = await getAlbumCoverUrl(slug);
  return (
    <>
      {coverUrl ? (
        <div className="album-backdrop" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" decoding="async" />
        </div>
      ) : null}
      {children}
    </>
  );
}
