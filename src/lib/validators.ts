export function isValidUsername(v: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(v);
}

export function isValidEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

export function isValidPassword(v: string): boolean {
  return v.length >= 8;
}

export function isValidCode(v: string): boolean {
  return /^\d{6}$/.test(v);
}
