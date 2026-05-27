/**
 * Crypto Service — Explicit Encryption for Sensitive Financial Data
 * 
 * ARCHITECTURE DECISION:
 * This service uses EXPLICIT encrypt/decrypt calls — NOT Mongoose hooks.
 * 
 * Why:
 * - No hidden decryption side effects
 * - No accidental plaintext leaks during serialization
 * - Full observability — every encrypt/decrypt is a conscious call
 * - Easier debugging — no "magic" in the data layer
 * - No mongoose weirdness with getters/setters and toJSON
 * 
 * Algorithm: AES-256-GCM (authenticated encryption)
 * - Provides both confidentiality and integrity
 * - GCM tag prevents tampering with ciphertext
 * - Each encryption uses a unique IV (initialization vector)
 * 
 * USAGE:
 *   import { encryptAccountNumber, decryptAccountNumber, maskAccountNumber } from '../services/cryptoService.js';
 *   
 *   // On save:
 *   bankDetails.accountNumber = encryptAccountNumber('1234567890');
 *   
 *   // On read (for payout processing):
 *   const plaintext = decryptAccountNumber(bankDetails.accountNumber);
 *   
 *   // On API response:
 *   const masked = maskAccountNumber(decryptAccountNumber(bankDetails.accountNumber));
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;    // 128-bit IV for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag
const ENCODING = 'hex';
const SEPARATOR = ':';   // Separates IV:ciphertext:tag in stored string

/**
 * Get encryption key from environment.
 * Validates key exists and is correct length.
 * 
 * @returns {Buffer} 32-byte encryption key
 * @throws {Error} if key is missing or invalid
 */
const getEncryptionKey = () => {
  const key = process.env.BANK_ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'BANK_ENCRYPTION_KEY environment variable is required for financial data encryption. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const keyBuffer = Buffer.from(key, 'hex');

  if (keyBuffer.length !== 32) {
    throw new Error(
      `BANK_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${key.length} characters.`
    );
  }

  return keyBuffer;
};

/**
 * Encrypt a bank account number.
 * 
 * @param {string} plaintext - The raw account number
 * @returns {string} Encrypted string in format "iv:ciphertext:tag"
 * @throws {Error} if encryption fails or key is invalid
 */
export const encryptAccountNumber = (plaintext) => {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('encryptAccountNumber: plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const tag = cipher.getAuthTag();

  // Store as "iv:ciphertext:tag" — all hex-encoded
  return [
    iv.toString(ENCODING),
    encrypted,
    tag.toString(ENCODING)
  ].join(SEPARATOR);
};

/**
 * Decrypt a bank account number.
 * 
 * @param {string} encryptedString - String in format "iv:ciphertext:tag"
 * @returns {string} The decrypted plaintext account number
 * @throws {Error} if decryption fails, data is tampered, or key is invalid
 */
export const decryptAccountNumber = (encryptedString) => {
  if (!encryptedString || typeof encryptedString !== 'string') {
    throw new Error('decryptAccountNumber: encrypted string must be non-empty');
  }

  // If the value doesn't contain separators, it's likely still plaintext
  // (pre-migration data). Return as-is for backward compatibility.
  if (!encryptedString.includes(SEPARATOR)) {
    return encryptedString;
  }

  const parts = encryptedString.split(SEPARATOR);
  if (parts.length !== 3) {
    throw new Error('decryptAccountNumber: invalid encrypted format. Expected "iv:ciphertext:tag"');
  }

  const [ivHex, ciphertext, tagHex] = parts;
  const key = getEncryptionKey();

  const iv = Buffer.from(ivHex, ENCODING);
  const tag = Buffer.from(tagHex, ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Mask an account number for display in API responses.
 * Shows only the last 4 digits.
 * 
 * @param {string} accountNumber - Plaintext account number
 * @returns {string} Masked string like "XXXX XXXX 1234"
 */
export const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== 'string') {
    return 'XXXX XXXX XXXX';
  }

  // Strip any spaces/dashes for consistent processing
  const clean = accountNumber.replace(/[\s-]/g, '');

  if (clean.length <= 4) {
    return clean; // Too short to mask meaningfully
  }

  const last4 = clean.slice(-4);
  const maskedLength = clean.length - 4;
  const maskedGroups = Math.ceil(maskedLength / 4);

  return Array(maskedGroups).fill('XXXX').join(' ') + ' ' + last4;
};

/**
 * Check if a stored value is already encrypted (vs plaintext pre-migration data).
 * 
 * @param {string} value - The stored value to check
 * @returns {boolean} true if the value appears to be encrypted
 */
export const isEncrypted = (value) => {
  if (!value || typeof value !== 'string') return false;

  const parts = value.split(SEPARATOR);
  if (parts.length !== 3) return false;

  // Check if all parts are valid hex
  return parts.every(part => /^[0-9a-f]+$/i.test(part));
};
