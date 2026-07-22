export const MTU_EMAIL_DOMAIN = 'mtu.edu.et';
export const MTU_EMAIL_MESSAGE = `Email must use the @${MTU_EMAIL_DOMAIN} domain`;

export function normalizeMtuEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isMtuEmail(value) {
  return /^[^@\s]+@mtu\.edu\.et$/i.test(normalizeMtuEmail(value));
}
