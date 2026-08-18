import { redirect } from "next/navigation";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.tenant.kind !== "tenant" || authorized.actor.kind === "super-admin") {
    redirect("/");
  }

  return (
    <main className="portal-shell">
      <TenantNav albumName={authorized.tenant.context.displayName} surface="friend" />
      <section className="portal-body">
        <h1 className="portal-heading">Add your photos</h1>
        <p className="portal-placeholder">
          The camera picker, preview, and upload flow arrive with the next phase of the build.
        </p>
      </section>
    </main>
  );
}
