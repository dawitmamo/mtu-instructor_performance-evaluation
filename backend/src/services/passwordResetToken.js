import crypto from 'node:crypto';

export function issuePasswordResetToken(user, { ttlMs = 1000 * 60 * 30 } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);
  user.resetPasswordTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  user.resetPasswordExpiresAt = expiresAt;
  return { token, expiresAt };
}
