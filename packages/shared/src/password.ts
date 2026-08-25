import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash de contraseñas con scrypt (node:crypto, sin dependencia externa).
 * Formato: salt.hash en base64url, separados por '.'.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split('.');
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Código de respaldo tipo "XXXX-XXXX-XXXX" (sin caracteres ambiguos: 0/O, 1/I).
 * Se muestra una sola vez al usuario; se guarda solo su hash (mismo esquema
 * que la contraseña) y se rota cada vez que se usa para restablecer.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRecoveryCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

export function hashRecoveryCode(code: string): string {
  return hashPassword(normalizeRecoveryCode(code));
}

export function verifyRecoveryCode(code: string, stored: string): boolean {
  return verifyPassword(normalizeRecoveryCode(code), stored);
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/** Token opaco de sesión (128 bits), para la cookie httpOnly. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
