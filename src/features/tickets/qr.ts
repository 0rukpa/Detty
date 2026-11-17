/**
 * Signed ticket QR tokens (spec 7.2): "a signed token, not just an ID".
 *
 *   token = "<ticketId>.<HMAC-SHA256(ticketId) as base64url, first 22 chars>"
 *
 * A scanner can't be fooled by a guessed or edited ticket id, because the
 * signature only verifies with the server's secret. Whether a ticket is still
 * valid (not used / refunded) is then checked in the database.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIG_LENGTH = 22; // ~131 bits

function secret(): string {
  const s = process.env.TICKET_SIGNING_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!s) throw new Error("Set TICKET_SIGNING_SECRET in .env.local to issue tickets.");
  return s;
}

function sign(ticketId: string, key: string): string {
  return createHmac("sha256", key).update(`detty-ticket:${ticketId.toLowerCase()}`).digest("base64url").slice(0, SIG_LENGTH);
}

export function signTicket(ticketId: string, key: string = secret()): string {
  if (!UUID.test(ticketId)) throw new Error("Invalid ticket id");
  return `${ticketId.toLowerCase()}.${sign(ticketId, key)}`;
}

/** Returns the ticket id if the token is authentic, otherwise null. */
export function verifyTicketToken(token: string, key: string = secret()): string | null {
  const [id, sig, ...rest] = token.trim().split(".");
  if (rest.length > 0 || !id || !sig || !UUID.test(id) || sig.length !== SIG_LENGTH) return null;
  const expected = Buffer.from(sign(id, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id.toLowerCase();
}
