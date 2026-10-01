/**
 * The address every outbound email is sent from.
 *
 * One definition rather than the seven copies of `process.env.RESEND_FROM_EMAIL || "..."` this
 * replaces -- those drifted out of reach of a single change, so switching the address meant finding
 * all of them and the fallback silently disagreed with whatever was configured.
 *
 * `service@` rather than `no-reply@`, which is Resend's own guidance: mailbox providers treat a
 * no-reply sender as a weaker signal, and a customer who replies to a service summary is doing a
 * reasonable thing that should not vanish.
 *
 * That only holds if the mailbox actually receives. Resend does not accept inbound mail by default,
 * so service@ needs forwarding set up on the domain -- otherwise a reply is as lost as it was
 * before, just less obviously. The per-organization `replyTo` (Organization.welcomeEmailSupportEmail)
 * is what really gets a customer's reply to a human, and it stays the primary route for that.
 */
const FALLBACK_FROM = "service@mail.aquarunner247.com";

export function resolveFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || FALLBACK_FROM;
}
