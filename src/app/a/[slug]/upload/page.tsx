import { redirect } from "next/navigation";
import { TenantNav } from "@/components/tenant-nav";
import { UploadForm } from "@/components/upload-form";
import { getAuthorizedAlbumActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function UploadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await getAuthorizedAlbumActor(slug);
  if (!authorized) redirect(`/a/${slug}`);

  return (
    <main className="portal-shell">
      <TenantNav albumName={authorized.tenant.displayName} slug={slug} isAdmin={authorized.actor.kind === "admin"} />
      <section className="portal-body">
        <h1 className="portal-heading">Add your photos</h1>
        <UploadForm />
      </section>
    </main>
  );
}
