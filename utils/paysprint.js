const crypto = require('crypto');

// Base64 URL helper
const base64url = (str) => {
    return str.toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
};

/**
 * Extract partnerId from environment or decoded JWT_KEY
 */
const getPartnerId = () => {
    // Check if it's explicitly set in .env
    if (process.env.PAYSPRINT_PARTNER_ID) {
        return process.env.PAYSPRINT_PARTNER_ID;
    }
    
    // Otherwise fallback to the user's correct Partner ID
    return 'PS003371';
};

/**
 * Get Base URL based on Environment
 */
const getBaseUrl = () => {
    const env = (process.env.ENVIRONMENT || 'LIVE').toUpperCase();
    return env === 'LIVE' ? 'https://api.paysprint.in' : 'https://uat.paysprint.in';
};

/**
 * Generate PaySprint HS256 JWT Token
 */
const generateToken = (product = 'WALLET') => {
    const jwtKeyRaw = process.env.JWT_KEY || 'UFMwMDMzNzE0ZGU5MzU0NDIzNGFkZmZiYjY4MWVkNjBmZmNmYjk0MQ==';
    const partnerId = getPartnerId();

    // PaySprint JWT_KEY is base64-encoded — decode it to raw bytes for HMAC signing
    const jwtKeyBytes = Buffer.from(jwtKeyRaw, 'base64');

    const header = { typ: 'JWT', alg: 'HS256' };
    const payload = {
        iss: 'PAYSPRINT',
        timestamp: Math.floor(Date.now() / 1000),
        partnerId: partnerId,
        product: product,
        reqid: String(Math.floor(100000 + Math.random() * 900000))
    };

    const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
    const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
    const signatureInput = `${headerB64}.${payloadB64}`;

    // Use the decoded bytes as the HMAC secret (not the raw base64 string)
    const signature = crypto.createHmac('sha256', jwtKeyBytes)
        .update(signatureInput)
        .digest();
    const signatureB64 = base64url(signature);

    return `${signatureInput}.${signatureB64}`;
};

/**
 * Common PaySprint Request Headers
 */
const getHeaders = (product = 'WALLET') => {
    const token = generateToken(product);
    const authKeyRaw = process.env.AUTHORISED_KEY || '';
    const partnerId = getPartnerId();

    // PaySprint AUTHORISED_KEY is base64-encoded — send the decoded hex string
    const authKey = authKeyRaw ? Buffer.from(authKeyRaw, 'base64').toString('utf8') : '';

    const headers = {
        'Token': token,
        'accept': 'application/json',
        'content-type': 'application/json',
        'User-Agent': partnerId
    };

    if (authKey) {
        headers['Authorisedkey'] = authKey;
    }

    return headers;
};

/**
 * Encrypt data using AES-128-CBC
 */
const encryptPayload = (data) => {
    const key = process.env.AES_ENCRYPTION_KEY || '21ab60b07494325c';
    const iv = process.env.AES_ENCRYPTION_IV || '9c7f151960cbab20';
    if (!data || !key || !iv) return null;

    try {
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return encrypted;
    } catch (e) {
        console.error('[PaySprint Encrypt Error]:', e.message);
        return null;
    }
};

/**
 * Decrypt data using AES-128-CBC
 */
const decryptPayload = (encData) => {
    const key = process.env.AES_ENCRYPTION_KEY || '21ab60b07494325c';
    const iv = process.env.AES_ENCRYPTION_IV || '9c7f151960cbab20';
    if (!encData || !key || !iv) return null;

    try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
        let decrypted = decipher.update(encData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (e) {
        try {
            const decipher2 = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32, '0')), Buffer.from(iv.padEnd(16, '0')));
            let decrypted2 = decipher2.update(encData, 'base64', 'utf8');
            decrypted2 += decipher2.final('utf8');
            return JSON.parse(decrypted2);
        } catch (e2) {
            console.warn('[PaySprint Decrypt Error]:', e2.message);
            return null;
        }
    }
};

module.exports = {
    getPartnerId,
    getBaseUrl,
    generateToken,
    getHeaders,
    encryptPayload,
    decryptPayload
};
