'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WIDTH = 150;
const HEIGHT = 48;
const COLORS = ['#2f6fe4', '#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#be123c'];
const TTL_MS = 10 * 60 * 1000;

const base64url = buffer => Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64url = value => Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
);

const randomCode = length => {
    let code = '';
    for (let index = 0; index < length; index++) {
        code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    return code;
};

const keyFromSecret = secret => crypto.createHash('sha256')
    .update(`captcha:${secret}`)
    .digest();

const makeToken = (secret, code) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
    const plaintext = Buffer.from(JSON.stringify({
        c: code,
        e: Date.now() + TTL_MS,
        n: crypto.randomBytes(6).toString('hex')
    }), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${base64url(iv)}.${base64url(tag)}.${base64url(ciphertext)}`;
};

const verifyToken = (secret, token, answer) => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return false;
    let data;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), fromBase64url(parts[0]));
        decipher.setAuthTag(fromBase64url(parts[1]));
        const plaintext = Buffer.concat([
            decipher.update(fromBase64url(parts[2])),
            decipher.final()
        ]).toString('utf8');
        data = JSON.parse(plaintext);
    } catch (error) {
        return false;
    }
    if (!data || !data.c || !data.e || data.e < Date.now()) return false;
    const given = String(answer || '').trim().toUpperCase();
    const expectedCode = String(data.c).toUpperCase();
    if (given.length !== expectedCode.length) return false;
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expectedCode));
};

const renderSvg = code => {
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="图形验证码">`);
    parts.push('<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f9ff"/><stop offset="1" stop-color="#e6f0ff"/></linearGradient></defs>');
    parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>`);
    for (let index = 0; index < 6; index++) {
        const x1 = crypto.randomInt(0, WIDTH);
        const y1 = crypto.randomInt(0, HEIGHT);
        const x2 = crypto.randomInt(0, WIDTH);
        const y2 = crypto.randomInt(0, HEIGHT);
        const color = COLORS[crypto.randomInt(0, COLORS.length)];
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity="0.18" stroke-width="1"/>`);
    }
    for (let index = 0; index < 28; index++) {
        const x = crypto.randomInt(0, WIDTH);
        const y = crypto.randomInt(0, HEIGHT);
        parts.push(`<circle cx="${x}" cy="${y}" r="${crypto.randomInt(1, 2)}" fill="#2f6fe4" fill-opacity="0.16"/>`);
    }
    const step = (WIDTH - 22) / code.length;
    for (let index = 0; index < code.length; index++) {
        const char = code[index];
        const x = 12 + index * step;
        const y = 33 + crypto.randomInt(-2, 3);
        const rotate = crypto.randomInt(-17, 18);
        const color = COLORS[crypto.randomInt(0, COLORS.length)];
        const size = crypto.randomInt(24, 29);
        parts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="700" font-family="'Trebuchet MS', Verdana, sans-serif" transform="rotate(${rotate} ${x + 8} ${y - 8})">${char}</text>`);
    }
    parts.push('</svg>');
    return parts.join('');
};

const createCaptcha = secret => {
    const code = randomCode(6);
    return {
        id: makeToken(secret, code),
        image: `data:image/svg+xml;base64,${Buffer.from(renderSvg(code), 'utf8').toString('base64')}`,
        expiresIn: Math.floor(TTL_MS / 1000)
    };
};

module.exports = {createCaptcha, verifyToken, TTL_MS};
