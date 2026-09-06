import CryptoJS from 'crypto-js';
import logger    from './logger.js';

/**
 * Field-Level Encryption (FLE) using AES-256.
 *
 * Encrypts sensitive PII before storing to MongoDB.
 * The encryption key lives ONLY in environment variables.
 *
 * Usage:
 *   const encrypted = encrypt(sensitiveValue);
 *   const plain     = decrypt(encrypted);
 */

function getKey() {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be at least 32 characters');
  }
  return key;
}

/**
 * Encrypt a string value using AES-256.
 * Returns null if value is null/undefined (preserves sparse data).
 */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  try {
    const key       = getKey();
    const iv        = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(String(plaintext), CryptoJS.enc.Utf8.parse(key), {
      iv,
      mode:    CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    // Prepend IV to ciphertext so we can decrypt later
    return iv.toString(CryptoJS.enc.Hex) + ':' + encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  } catch (err) {
    logger.error('Encryption failed', { error: err.message });
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt an AES-256 encrypted string.
 * Returns null if value is null/undefined.
 */
export function decrypt(ciphertext) {
  if (ciphertext === null || ciphertext === undefined) return null;
  try {
    const key      = getKey();
    const [ivHex, ctHex] = ciphertext.split(':');
    if (!ivHex || !ctHex) throw new Error('Invalid ciphertext format');

    const iv        = CryptoJS.enc.Hex.parse(ivHex);
    const ct        = CryptoJS.enc.Hex.parse(ctHex);
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ct },
      CryptoJS.enc.Utf8.parse(key),
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    logger.error('Decryption failed', { error: err.message });
    throw new Error('Decryption failed');
  }
}

/**
 * Encrypt only if the value is not already encrypted.
 * Useful for upserts.
 */
export function encryptIfNeeded(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.includes(':')) {
    // Already encrypted (contains IV separator)
    try { decrypt(value); return value; } catch (_) {}
  }
  return encrypt(value);
}
