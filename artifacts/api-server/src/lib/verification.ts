/**
 * Verification links are issued for one specific normalized email address.
 * Keeping normalization here prevents an old link from being applied to a
 * patient's replacement address after an administrator edits the record.
 */
export function normalizeVerificationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function verificationEmailMatchesPatient(
  issuedEmail: string | null | undefined,
  currentEmail: string,
): boolean {
  return Boolean(issuedEmail)
    && normalizeVerificationEmail(issuedEmail!) === normalizeVerificationEmail(currentEmail);
}