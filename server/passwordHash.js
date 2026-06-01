const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const key = await scrypt(password, salt, KEY_LENGTH);

  return `scrypt$${salt}$${key.toString('base64url')}`;
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword) {
    return { ok: false, needsRehash: false };
  }

  if (!storedPassword.startsWith('scrypt$')) {
    return {
      ok: storedPassword === password,
      needsRehash: storedPassword === password
    };
  }

  const [, salt, storedKey] = storedPassword.split('$');

  if (!salt || !storedKey) {
    return { ok: false, needsRehash: false };
  }

  const key = await scrypt(password, salt, KEY_LENGTH);
  const stored = Buffer.from(storedKey, 'base64url');

  if (stored.length !== key.length) {
    return { ok: false, needsRehash: false };
  }

  return {
    ok: crypto.timingSafeEqual(stored, key),
    needsRehash: false
  };
}

module.exports = {
  hashPassword,
  verifyPassword
};
