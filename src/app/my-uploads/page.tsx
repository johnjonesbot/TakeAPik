import { redirect } from "next/navigation";
import { MyUploads } from "@/components/my-uploads";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function MyUploadsPage() {
  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.tenant.kind !== "tenant" || authorized.actor.kind === "super-admin") {
    redirect("/");
  }

  return (
    <main className="portal-shell">
      <TenantNav
        albumName={authorized.tenant.context.displayName}
        isAdmin={authorized.actor.kind === "admin"}
      />
      <section className="portal-body">
        <h1 className="portal-heading">My uploads</h1>
        <MyUploads />
      </section>
    </main>
  );
}
