import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de secretos en reposo (spec §32: "tokens sin cifrar" está prohibido).
 * AES-256-GCM con clave de 32 bytes provista por entorno (TOKEN_ENCRYPTION_KEY, hex).
 * Formato de salida: iv.tag.ciphertext en base64url, separados por '.'.
 */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Secreto cifrado con formato inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf-8');
}

/** Genera una clave válida (para setup inicial: node -e "...generateEncryptionKey()"). */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

function keyFromHex(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en hexadecimal (64 caracteres)');
  }
  return key;
}
