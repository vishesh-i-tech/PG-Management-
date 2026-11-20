import crypto from "crypto";

/**
 * Generates a cryptographically secure random plaintext token for invitations.
 * 32 bytes of secure entropy => 64 character hex string.
 */
export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes the SHA-256 hex digest of a plaintext invitation token.
 * Matches PostgreSQL: encode(digest(p_plaintext_token, 'sha256'), 'hex').
 */
export function hashInvitationToken(token: string): string {
  if (!token || typeof token !== "string") {
    throw new Error("Cannot hash an empty or invalid invitation token.");
  }
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Calculates a default expiration date for invitations (default 7 days).
 */
export function getInvitationExpiryDate(days = 7): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry.toISOString();
}
