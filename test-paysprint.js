
const crypto = require('crypto');
const base64url = (str) => str.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const partnerId = 'PS0033714';
const jwtKeyStr = 'UFMwMDMzNzE0ZGU5MzU0NDIzNGFkZmZiYjY4MWVkNjBmZmNmYjk0MQ==';
const authKeyBase64 = 'ODk5MGQyMWYxZjFmOTZiZDAzYjE3M2VlMDU1NjZkYzQ=';
const authKeyDecoded = Buffer.from(authKeyBase64, 'base64').toString('utf8');
const aesKey = '21ab60b07494325c';
const aesIv = '9c7f151960cbab20';

const generateToken = (secret) => {
    const headerB64 = base64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })));
    const payloadB64 = base64url(Buffer.from(JSON.stringify({
        iss: 'PAYSPRINT', timestamp: Math.floor(Date.now() / 1000), partnerId: partnerId, product: 'ONBOARDING', reqid: '123456'
    })));
    const signatureInput = `${headerB64}.${payloadB64}`;
    const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest();
    return `${signatureInput}.${base64url(signature)}`;
};

const encryptBody = (data) => {
    const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(aesKey, 'utf8'), Buffer.from(aesIv, 'utf8'));
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
};

const rawPayload = {
    merchantcode: partnerId,
    mobile: '9999999999',
    is_new: '1',
    email: 'test@mbmitra.com',
    firm: 'Debug Test',
    callback: 'https://api.mbmitra.in/api/paysprint/onboard/callback'
};

const testApi = async (name, authKey, body) => {
    try {
        const res = await fetch('https://api.paysprint.in/api/v1/service/onboard/onboard/getonboardurl', {
            method: 'POST',
            headers: {
                'Token': generateToken(jwtKeyStr),
                'accept': 'application/json',
                'content-type': 'application/json',
                'User-Agent': partnerId,
                'Authorisedkey': authKey
            },
            body: JSON.stringify(body)
        });
        const text = await res.text();
        console.log(`\n[${name}] Response:`, text);
    } catch(e) { console.log(e.message); }
};

(async () => {
    await testApi('1. Base64 AuthKey + Raw Payload', authKeyBase64, rawPayload);
    await testApi('2. Decoded AuthKey + Raw Payload', authKeyDecoded, rawPayload);
    await testApi('3. Base64 AuthKey + Encrypted Payload', authKeyBase64, { body: encryptBody(rawPayload) });
    await testApi('4. Decoded AuthKey + Encrypted Payload', authKeyDecoded, { body: encryptBody(rawPayload) });
})();
