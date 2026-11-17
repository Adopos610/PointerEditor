const API_BASE = 'https://forum.ctspace.xyz/api';
const TOKEN_KEY = 'pointer.community.token';
const USER_KEY = 'pointer.community.user';

const parseResponse = async response => {
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (error) {
        data = null;
    }
    if (!response.ok) {
        let message = (data && data.message) || `请求失败（${response.status}）`;
        if (Array.isArray(message)) message = message.join('；');
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
    }
    return data;
};

const getBridge = () => (
    typeof window !== 'undefined' && window.pointerCommunity
        ? window.pointerCommunity
        : null
);

const handleBridgeResult = result => {
    if (!result.ok) {
        const requestError = new Error(result.message || '请求失败');
        requestError.status = result.status;
        throw requestError;
    }
    return result.data;
};

const request = async (path, options = {}) => {
    const {method = 'GET', token, body, form} = options;
    const bridge = getBridge();
    if (bridge) {
        const result = await bridge.request({method, path, token, json: body});
        return handleBridgeResult(result);
    }

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
        payload = form;
    } else if (body) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {method, headers, body: payload});
    } catch (error) {
        throw new Error('无法连接创客次元，请检查网络后重试');
    }
    return parseResponse(response);
};

export const getSession = () => {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return null;
        return {
            token,
            user: JSON.parse(localStorage.getItem(USER_KEY) || 'null')
        };
    } catch (error) {
        return null;
    }
};

export const clearSession = () => {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch (error) {
        // ignore
    }
};

const setSession = (token, user) => {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    } catch (error) {
        // ignore
    }
};

export const fetchCaptcha = () => request('/captcha');

export const fetchMe = token => request('/auth/me', {token});

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));

const sha256Hex = input => {
    const bytes = [];
    for (let index = 0; index < input.length; index++) {
        bytes.push(input.charCodeAt(index) & 0xff);
    }
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(
        (bitLength / 0x100000000) >>> 24 & 0xff,
        (bitLength / 0x100000000) >>> 16 & 0xff,
        (bitLength / 0x100000000) >>> 8 & 0xff,
        (bitLength / 0x100000000) & 0xff,
        (bitLength >>> 24) & 0xff,
        (bitLength >>> 16) & 0xff,
        (bitLength >>> 8) & 0xff,
        bitLength & 0xff
    );

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const w = new Int32Array(64);

    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let index = 0; index < 16; index++) {
            const base = offset + index * 4;
            w[index] = (bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3];
        }
        for (let index = 16; index < 64; index++) {
            const s0 = rotateRight(w[index - 15], 7) ^ rotateRight(w[index - 15], 18) ^ (w[index - 15] >>> 3);
            const s1 = rotateRight(w[index - 2], 17) ^ rotateRight(w[index - 2], 19) ^ (w[index - 2] >>> 10);
            w[index] = (w[index - 16] + s0 + w[index - 7] + s1) | 0;
        }
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;
        for (let index = 0; index < 64; index++) {
            const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + s1 + ch + SHA256_K[index] + w[index]) | 0;
            const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (s0 + maj) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) | 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) | 0;
        }
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
        h5 = (h5 + f) | 0;
        h6 = (h6 + g) | 0;
        h7 = (h7 + h) | 0;
    }

    return [h0, h1, h2, h3, h4, h5, h6, h7]
        .map(value => (value >>> 0).toString(16).padStart(8, '0'))
        .join('');
};

export const solvePow = async (challenge, difficulty) => {
    const prefix = `${challenge}:`;
    const target = '0'.repeat(difficulty);
    let nonce = 0;
    for (;;) {
        const chunkEnd = nonce + 20000;
        for (; nonce < chunkEnd; nonce++) {
            if (sha256Hex(prefix + nonce).startsWith(target)) {
                return String(nonce);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
};

export const login = async ({username, password, captchaAnswer, captcha}) => {
    const nonce = await solvePow(captcha.pow.challenge, captcha.pow.difficulty);
    const result = await request('/auth/login', {
        method: 'POST',
        body: {
            username,
            password,
            captchaToken: captcha.token,
            captchaAnswer,
            captchaPowNonce: nonce
        }
    });
    setSession(result.token, result.user);
    return {token: result.token, user: result.user};
};

export const loginWithApiKey = async apiKey => {
    const trimmed = apiKey.trim();
    const user = await fetchMe(trimmed);
    setSession(trimmed, user);
    return {token: trimmed, user};
};

const uploadResource = async (token, blob, uploadName) => {
    const bridge = getBridge();
    if (bridge) {
        const buffer = new Uint8Array(await blob.arrayBuffer());
        const result = await bridge.request({
            method: 'POST',
            path: '/resources/upload',
            token,
            file: {
                data: buffer,
                type: blob.type || 'application/octet-stream',
                filename: 'upload.bin'
            },
            fileDisplayName: uploadName
        });
        return handleBridgeResult(result);
    }
    const form = new FormData();
    form.append('file', blob, uploadName.replace(/[^\w.-]+/g, '_'));
    form.append('name', uploadName);
    return request('/resources/upload', {method: 'POST', token, form});
};

const safeFileName = title => (title || 'PointerEditor作品')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 60) || 'PointerEditor作品';

export const publishProject = async ({token, title, summary, category, allowDownload, sb3, cover}) => {
    const baseName = safeFileName(title);
    const [fileResource, coverResource] = await Promise.all([
        uploadResource(token, sb3, `${baseName}.sb3`),
        cover ? uploadResource(token, cover, `${baseName}-cover.png`) : Promise.resolve(null)
    ]);
    const body = {
        title,
        summary,
        category,
        fileResourceId: fileResource.id,
        allowDownload,
        syncToForum: false,
        forumTagIds: []
    };
    if (coverResource) body.coverResourceId = coverResource.id;
    return request('/projects', {method: 'POST', token, body});
};

export const fetchProjectDetail = (id, token) => request(`/projects/${id}`, {token});
