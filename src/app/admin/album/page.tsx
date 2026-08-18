import { redirect } from "next/navigation";
import { CoverPicker } from "@/components/admin/cover-picker";
import { ExportPanel } from "@/components/admin/export-panel";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function AdminAlbumPage() {
  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.actor.kind !== "admin" || authorized.tenant.kind !== "tenant") {
    redirect("/admin");
  }

  return (
    <main className="portal-shell">
      <TenantNav albumName={authorized.tenant.context.displayName} surface="admin" />
      <section className="portal-body portal-body-wide">
        <h1 className="portal-heading">Album</h1>
        <div style={{ marginBottom: 24, maxWidth: 480 }}>
          <ExportPanel />
        </div>
        <CoverPicker />
      </section>
    </main>
  );
}
