/**
 * Short SMS invitation: the album link plus the access code (guests reached by
 * text usually have no email on file, so the code must travel with the link).
 * Kept concise to stay within one or two SMS segments.
 */
export function buildInviteSms(input: {
  eventName: string;
  inviteUrl: string;
  accessCode: string | null;
}): string {
  const codePart = input.accessCode ? ` Access code: ${input.accessCode}.` : "";
  return `You're invited to the ${input.eventName} photo album on TakeAPik. Open ${input.inviteUrl}${codePart}`;
}
