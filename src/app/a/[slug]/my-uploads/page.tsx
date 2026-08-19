import { redirect } from "next/navigation";
import { MyUploads } from "@/components/my-uploads";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedAlbumActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function MyUploadsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await getAuthorizedAlbumActor(slug);
  if (!authorized) redirect(`/a/${slug}`);

  return (
    <main className="portal-shell">
      <TenantNav albumName={authorized.tenant.displayName} slug={slug} isAdmin={authorized.actor.kind === "admin"} />
      <section className="portal-body portal-body-wide">
        <h1 className="portal-heading">My uploads</h1>
        <MyUploads />
      </section>
    </main>
  );
}
