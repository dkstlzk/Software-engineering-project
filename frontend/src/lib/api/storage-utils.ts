/**
 * Encrypted storage utilities for sensitive data.
 * Uses simple XOR encryption with a key derived from the environment.
 * Note: This is not cryptographically secure. For production use TweetNaCl or similar.
 */

const ENCRYPTION_PREFIX = "enc_";

/**
 * Simple encryption function (NOT secure - for basic obfuscation only)
 * For production, use proper encryption like TweetNaCl.js or libsodium.js
 */
function encrypt(data: string, key: string): string {
  const encoded = btoa(data);
  const keyRepeated = key.repeat(Math.ceil(encoded.length / key.length));
  let encrypted = "";

  for (let i = 0; i < encoded.length; i++) {
    encrypted += String.fromCharCode(
      encoded.charCodeAt(i) ^ keyRepeated.charCodeAt(i)
    );
  }

  return btoa(encrypted);
}

/**
 * Simple decryption function (NOT secure - for basic obfuscation only)
 */
function decrypt(encryptedData: string, key: string): string | null {
  try {
    const encrypted = atob(encryptedData);
    const keyRepeated = key.repeat(Math.ceil(encrypted.length / key.length));
    let decrypted = "";

    for (let i = 0; i < encrypted.length; i++) {
      decrypted += String.fromCharCode(
        encrypted.charCodeAt(i) ^ keyRepeated.charCodeAt(i)
      );
    }

    return atob(decrypted);
  } catch {
    return null;
  }
}

/**
 * Derive encryption key from browser fingerprint
 */
function getEncryptionKey(): string {
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${userAgent}${language}${timezone}`;
}

/**
 * Store encrypted data in localStorage
 */
export function setEncryptedStorage(key: string, value: string): void {
  try {
    const encryptionKey = getEncryptionKey();
    const encrypted = encrypt(value, encryptionKey);
    localStorage.setItem(ENCRYPTION_PREFIX + key, encrypted);
  } catch (error) {
    console.error("Failed to encrypt and store data:", error);
    // Fallback to unencrypted storage
    localStorage.setItem(key, value);
  }
}

/**
 * Retrieve encrypted data from localStorage
 */
export function getEncryptedStorage(key: string): string | null {
  try {
    const encryptedValue = localStorage.getItem(ENCRYPTION_PREFIX + key);
    if (!encryptedValue) {
      // Fallback to unencrypted storage
      return localStorage.getItem(key);
    }

    const encryptionKey = getEncryptionKey();
    return decrypt(encryptedValue, encryptionKey);
  } catch (error) {
    console.error("Failed to decrypt stored data:", error);
    return null;
  }
}

/**
 * Clear encrypted data from localStorage
 */
export function clearEncryptedStorage(key: string): void {
  localStorage.removeItem(ENCRYPTION_PREFIX + key);
  localStorage.removeItem(key);
}

/**
 * Check if encrypted value exists
 */
export function hasEncryptedStorage(key: string): boolean {
  return (
    localStorage.getItem(ENCRYPTION_PREFIX + key) !== null ||
    localStorage.getItem(key) !== null
  );
}
