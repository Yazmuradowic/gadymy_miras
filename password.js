const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

function verifyPassword(plain, stored) {
  if (!isHashed(stored)) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hashHex] = parts;
  const storedHash = Buffer.from(hashHex, 'hex');
  const candidateHash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN);
  if (candidateHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, storedHash);
}

module.exports = { hashPassword, verifyPassword, isHashed };
