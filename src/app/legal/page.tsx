import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy & Terms — TakeAPik",
  description: "TakeAPik privacy policy and terms of service."
};

const UPDATED = "August 20, 2026";

export default function LegalPage() {
  return (
    <main className="landing-shell legal-shell">
      <header className="brand-bar">
        <Wordmark />
      </header>

      <article className="legal">
        <p className="legal-draft">
          Draft for legal review — not yet counsel-approved. Placeholders in [brackets] must be
          completed before publication.
        </p>

        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: {UPDATED}</p>

        <p>
          TakeAPik (&ldquo;TakeAPik,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) provides private, event-scoped
          photo albums. This policy explains what we collect, why, how we protect it, and the choices you have.
          It applies to the TakeAPik website and service at takeapik.com. The service is operated by [LEGAL ENTITY
          NAME], [ADDRESS], reachable at [PRIVACY CONTACT EMAIL].
        </p>

        <h2>1. The roles involved</h2>
        <p>
          Each album belongs to an <strong>event host</strong> (the album administrator) who invites{" "}
          <strong>guests</strong> to view and add photos. For the personal data inside an album, the host is the
          party who decides what is collected and why; TakeAPik processes that data on their behalf and for
          operating the service. If you are a guest with questions about a specific album, contact its host
          first; you may also contact us.
        </p>

        <h2>2. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information (hosts):</strong> name, email address, and a password (stored only as a
            strong one-way hash). Hosts may enable two-factor authentication.
          </li>
          <li>
            <strong>Guest membership information:</strong> the name and email address a host adds for each guest,
            used to send invitations and to sign guests in.
          </li>
          <li>
            <strong>Event information:</strong> event name, event date, and an access code that guests use to
            enter the album.
          </li>
          <li>
            <strong>Photos and captions:</strong> images uploaded to an album and any optional descriptions.
            Images are resized on your device before upload, and location (GPS) and other metadata are stripped
            in the process — original camera metadata is not uploaded.
          </li>
          <li>
            <strong>Technical and security data:</strong> we log request identifiers, coarse actor and tenant
            identifiers, route, timing, and outcome, plus one-way hashes of IP address and user agent for abuse
            prevention. We do not log photos, access codes, passwords, tokens, email contents, or signed media
            URLs.
          </li>
        </ul>
        <p>
          We do not use third-party advertising or analytics trackers, and we do not sell personal information.
        </p>

        <h2>3. How we use information</h2>
        <ul>
          <li>To create and operate albums, sign users in, and deliver invitation, welcome, and password-reset emails.</li>
          <li>To store, resize-verify, and serve album photos to the album&rsquo;s members.</li>
          <li>To secure the service — rate limiting, abuse detection, audit logging of privileged actions.</li>
          <li>To communicate service and security notices.</li>
        </ul>

        <h2>4. How photos are stored and shared</h2>
        <p>
          Photos are held in private object storage and served only through short-lived signed links to signed-in
          members of the same album. Albums are isolated from one another: a session is bound to a single album,
          and every request is checked against that binding. Albums are not publicly listed or searchable, and
          knowing a link alone does not grant access without a valid membership and access code.
        </p>

        <h2>5. Email and credentials</h2>
        <p>
          Invitation and onboarding emails include the album&rsquo;s access code so guests can sign in easily.
          Because of this, a person with access to an invited guest&rsquo;s mailbox could open that album; treat
          these emails as you would any message containing a login credential. Hosts can rotate the access code at
          any time, which immediately invalidates the old one.
        </p>

        <h2>6. Retention and deletion</h2>
        <p>
          Albums are event-scoped. Uploads open about one week before the event date and the album stays available
          for 90 days afterward, after which it is flagged for takedown. Hosts can export their photos before the
          window closes. A host or the platform can delete an album&rsquo;s contents (permanently removing photos
          from the database and storage) or delete an account entirely. Deletion is permanent and cannot be
          undone except from backups, which are themselves retained for a limited period and then expire.
          Security audit logs are retained for [RETENTION PERIOD].
        </p>

        <h2>7. Your rights and choices</h2>
        <p>
          Depending on where you live, you may have rights to access, correct, export, or delete your personal
          data, and to object to or restrict certain processing. Hosts can manage guest data directly in their
          album settings. For other requests, contact [PRIVACY CONTACT EMAIL]; we will respond within the period
          required by applicable law. You can decline non-essential cookies; TakeAPik uses only the strictly
          necessary cookie that keeps you signed in.
        </p>

        <h2>8. Security</h2>
        <p>
          We use HTTPS everywhere, a strict Content-Security-Policy, one-way hashing for passwords and tokens,
          encryption for sensitive stored values, host-only session cookies, and audit logging of privileged
          actions. No system is perfectly secure, but album isolation and least-privilege access are core to the
          design.
        </p>

        <h2>9. International transfers, children, and changes</h2>
        <p>
          Data may be processed in [DATA REGIONS]. TakeAPik is not directed to children under [AGE], and hosts are
          responsible for any consent needed to include a minor&rsquo;s photo. We may update this policy; material
          changes will be posted here with a new date.
        </p>

        <hr className="legal-rule" />

        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: {UPDATED}</p>

        <h2>1. Agreement</h2>
        <p>
          By using TakeAPik you agree to these terms. If you use TakeAPik on behalf of an organization, you agree
          on its behalf. If you do not agree, do not use the service.
        </p>

        <h2>2. Accounts and eligibility</h2>
        <p>
          Hosts must provide accurate information, keep their password and two-factor credentials secure, and are
          responsible for activity under their account. You must be at least [AGE] and legally able to enter this
          agreement.
        </p>

        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Upload content you do not have the right to share, or that is unlawful, infringing, or harmful.</li>
          <li>Upload photos of people without the consent required where the event takes place.</li>
          <li>Attempt to access albums, accounts, or data that are not yours, or probe, scan, or circumvent security.</li>
          <li>Interfere with the service, overload it, or use it to send spam or malware.</li>
        </ul>

        <h2>4. Your content</h2>
        <p>
          You keep ownership of the photos and captions you upload. You grant TakeAPik the limited license needed
          to store, resize, and display that content to your album&rsquo;s members and to operate and secure the
          service. You are responsible for your content and for having the rights and consents to share it.
        </p>

        <h2>5. Hosts and guests</h2>
        <p>
          Hosts control their album&rsquo;s membership, access code, event details, and content, and may remove
          guests or photos and export or delete the album. Guests may add and manage their own uploads and view
          the album while their membership is active. Access can be revoked at any time.
        </p>

        <h2>6. Availability, retention, and deletion</h2>
        <p>
          The service is provided on an ongoing basis but may change or have downtime. Albums follow the retention
          window described in the Privacy Policy. We may remove content or suspend accounts that violate these
          terms. Deletion is permanent as described above.
        </p>

        <h2>7. Disclaimers and liability</h2>
        <p>
          TakeAPik is provided &ldquo;as is,&rdquo; without warranties of any kind to the fullest extent permitted
          by law. We are not liable for indirect, incidental, or consequential damages, and our total liability is
          limited to the amount you paid us in the [12] months before the claim, or [AMOUNT] if you paid nothing.
          Some jurisdictions do not allow these limits, so parts may not apply to you.
        </p>

        <h2>8. Changes, termination, and governing law</h2>
        <p>
          We may update these terms; continued use means acceptance. Either party may terminate; on termination
          your right to use the service ends and album retention/deletion applies. These terms are governed by the
          laws of [JURISDICTION], and disputes will be resolved in [VENUE / DISPUTE PROCESS].
        </p>

        <h2>9. Contact</h2>
        <p>Questions about these terms or your data: [CONTACT EMAIL].</p>

        <p className="legal-footer-note">
          <a href="/">Back to takeapik.com</a>
        </p>
      </article>
    </main>
  );
}
