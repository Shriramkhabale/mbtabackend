const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (value, secret) => crypto
  .createHmac('sha256', secret)
  .update(value)
  .digest('base64url');

const createSessionToken = (user) => {
  const secret = process.env.JWT_KEY;
  if (!secret) throw new Error('JWT_KEY is not configured.');

  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: user.userId,
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  });
  const unsignedToken = `${header}.${payload}`;

  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
};

const verifySessionToken = (token) => {
  const secret = process.env.JWT_KEY;
  if (!secret || typeof token !== 'string' || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const unsignedToken = `${parts[0]}.${parts[1]}`;
  const expectedSignature = Buffer.from(sign(unsignedToken, secret));
  const actualSignature = Buffer.from(parts[2]);
  if (expectedSignature.length !== actualSignature.length ||
      !crypto.timingSafeEqual(expectedSignature, actualSignature)) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'HS256' || header.typ !== 'JWT' ||
        typeof payload.sub !== 'string' || !payload.sub ||
        payload.role !== 'retailer' || !Number.isInteger(payload.exp) ||
        payload.exp <= now) return null;
    return { userId: payload.sub, role: payload.role, expiresAt: payload.exp };
  } catch {
    return null;
  }
};

module.exports = { createSessionToken, verifySessionToken };
