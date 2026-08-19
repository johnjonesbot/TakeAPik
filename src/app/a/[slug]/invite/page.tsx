import { AccessForm } from "@/components/access-form";
import { Wordmark } from "@/components/wordmark";
import { getAlbumTenant } from "@/lib/page-context";
import { acceptInvitation } from "@/services/invitations";

export const dynamic = "force-dynamic";

/**
 * Invitation landing (/a/{slug}/invite). The link identifies the event and
 * membership and prefills the email; the eight-digit access code still has to
 * come from the host, so a leaked link alone cannot open the album.
 */
export default async function InvitePage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;
  const tenant = await getAlbumTenant(slug);

  const invite = tenant.kind === "tenant" && token ? await acceptInvitation(token, tenant.context.tenantId) : null;

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
        <Wordmark href={`/a/${slug}`} />
      </header>
      <section className="tenant-login">
        <h1>{invite.eventName}</h1>
        <p className="intro">You&apos;re invited. Enter the 8-digit access code from your host to open the album.</p>
        <AccessForm surface="tenant" slug={slug} defaultEmail={invite.membershipEmail} />
      </section>
    </main>
  );
}
