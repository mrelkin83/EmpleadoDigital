import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, generateEncryptionKey } from '@empleado/shared';

describe('cifrado de secretos (AES-256-GCM)', () => {
  const key = generateEncryptionKey();

  it('cifra y descifra en roundtrip', () => {
    const token = 'IGQVJ...token-de-larga-duracion';
    const encrypted = encryptSecret(token, key);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted, key)).toBe(token);
  });

  it('el mismo texto produce cifrados distintos (IV aleatorio)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
  });

  it('rechaza claves inválidas y payloads manipulados', () => {
    expect(() => encryptSecret('x', 'clave-corta')).toThrow();
    const encrypted = encryptSecret('x', key);
    const tampered = encrypted.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(encrypted, generateEncryptionKey())).toThrow();
  });
});
