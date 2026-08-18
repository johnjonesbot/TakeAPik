import { AccessForm } from "@/components/access-form";
import { getPageTenant } from "@/lib/page-context";
import { acceptInvitation } from "@/services/invitations";

export const dynamic = "force-dynamic";

/**
 * Invitation landing on the tenant host. The link identifies the event and
 * membership; the eight-digit access code still has to come from the host,
 * so a leaked link alone cannot open the album.
 */
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const tenant = await getPageTenant();
  const { token } = await searchParams;

  const invite =
    tenant.kind === "tenant" && token ? await acceptInvitation(token, tenant.context.tenantId) : null;

  if (!invite || tenant.kind !== "tenant") {
    return (
      <main className="landing-shell tenant-login-shell">
        <section className="tenant-login">
          <h1>That link didn&apos;t work</h1>
          <p className="intro">
            This invitation may have expired or been replaced. Ask your host to send a fresh one —
            or open the album directly if you have the event details.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="landing-shell tenant-login-shell">
      <header className="brand-bar">
        <a className="wordmark" href="/" aria-label="TakeAPik home">
          take<span>a</span>pik
        </a>
      </header>
      <section className="tenant-login">
        <h1>{invite.eventName}</h1>
        <p className="intro">
          You&apos;re invited. Enter the 8-digit access code from your host to open the album.
        </p>
        <AccessForm surface="tenant" defaultEventName={invite.eventName} defaultEmail={invite.membershipEmail} />
      </section>
    </main>
  );
}
