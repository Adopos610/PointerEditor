'use strict';

/*
 * PointerE cloud service.
 *
 * - PointerE accounts: registration, captcha, email verification, login.
 * - Management console at a non-obvious path.
 * - PointerEditor collaboration relay over WebSocket (same process).
 *
 * Accounts and the 创客次元 community are deliberately separate systems.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const dns = require('dns');
const {URL} = require('url');

const store = require('./lib/store.cjs');
const captcha = require('./lib/captcha.cjs');
const mailer = require('./lib/mailer.cjs');

const PORT = Number(process.env.POINTER_COLLAB_PORT || 8788);
const HOST = process.env.POINTER_COLLAB_HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const COMMUNITY_EXTENSION_DIR = path.join(PUBLIC_DIR, 'community-extensions');
const EXTENSION_SUBMISSION_DIR = path.join(store.DATA_DIR, 'extension-submissions');
fs.mkdirSync(COMMUNITY_EXTENSION_DIR, {recursive: true});
fs.mkdirSync(EXTENSION_SUBMISSION_DIR, {recursive: true});
const PUBLIC_BASE = process.env.POINTER_PUBLIC_URL || store.getConfig().publicBaseUrl;
const AUTH_DISABLED = String(process.env.POINTER_COLLAB_AUTH || '').toLowerCase() === 'off';

const MAX_MESSAGE_BYTES = 24 * 1024 * 1024;
const MAX_TARGET_BYTES = 4 * 1024 * 1024;
const MAX_CLIENTS_PER_ROOM = 8;
const MAX_TOTAL_CLIENTS = 500;
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 30000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_API_REQUESTS_PER_MINUTE = 240;
const MAX_WS_UPGRADES_PER_MINUTE = 30;
const WS_MESSAGE_WINDOW_MS = 10 * 1000;
const WS_MESSAGE_LIMIT = 400;
const MAX_ROOMS = 200;
const MAX_CLAIMS_PER_CLIENT = 20;
const CLAIM_WINDOW_MS = 15 * 1000;
const MAX_CLAIMS_PER_WINDOW = 8;
const MAX_BLOCKS_PER_WINDOW = 120;
const BLOCK_WINDOW_MS = 10 * 1000;
const MAX_STATE_PER_WINDOW = 3;
const STATE_WINDOW_MS = 30 * 1000;
const MAX_FAILED_JOINS = 6;
const ALLOWED_SITE_HOSTS = new Set([
    'www.ctspace.xyz',
    'ctspace.xyz',
    'vable.ctspace.xyz',
    'peditor.ctspace.xyz',
    'forum.ctspace.xyz'
]);
const EXTRA_ALLOWED_ORIGINS = new Set(
    String(process.env.POINTER_ALLOWED_ORIGINS || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'";

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map();
let nextClientId = 1;
const startedAt = Date.now();

const log = (...args) => console.log(new Date().toISOString(), ...args);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const displayName = user => (user.nickname || user.username || 'PointerE 用户');

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
};

const normalizeIp = value => String(value || '').replace(/^::ffff:/, '');

const isPrivateIp = ip => (
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip) ||
    ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')
);

const originAllowed = origin => {
    if (!origin) return false;
    if (EXTRA_ALLOWED_ORIGINS.has(origin)) return true;
    let parsed;
    try {
        parsed = new URL(origin);
    } catch (error) {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.protocol === 'https:' && ALLOWED_SITE_HOSTS.has(parsed.hostname)) return true;
    return parsed.protocol === 'http:' &&
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
};

const applySecurityHeaders = (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (PUBLIC_BASE.startsWith('https://') || String(req.headers['x-forwarded-proto'] || '') === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
};

const applyCors = (req, res) => {
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
};

const sendJson = (res, status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(body);
};

const sendHtml = (res, status, html) => {
    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': CSP,
        'X-Robots-Tag': 'noindex, nofollow'
    });
    res.end(html);
};

const readBody = (req, limit = MAX_BODY_BYTES) => new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '');
    if (contentType && !/^application\/json(?:;|$)/i.test(contentType)) {
        reject(Object.assign(new Error('仅接受 JSON 请求'), {status: 415}));
        return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
        size += chunk.length;
        if (size > limit) {
            reject(Object.assign(new Error('请求内容过大'), {status: 413}));
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => {
        if (!chunks.length) {
            resolve({});
            return;
        }
        try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                reject(Object.assign(new Error('请求格式错误'), {status: 400}));
                return;
            }
            resolve(parsed);
        } catch (error) {
            reject(Object.assign(new Error('请求格式错误'), {status: 400}));
        }
    });
    req.on('error', reject);
});

const clientIp = req => {
    const remote = normalizeIp(req.socket.remoteAddress);
    if (isPrivateIp(remote)) {
        const cf = normalizeIp(req.headers['cf-connecting-ip']);
        if (/^[0-9a-f:.]+$/i.test(cf)) return cf;
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length) {
            const candidate = normalizeIp(forwarded.split(',')[0].trim());
            if (/^[0-9a-f:.]+$/i.test(candidate)) return candidate;
        }
        const real = normalizeIp(req.headers['x-real-ip']);
        if (/^[0-9a-f:.]+$/i.test(real)) return real;
    }
    return remote || 'unknown';
};

const buckets = new Map();
const rateLimit = (ip, key, limit, windowMs) => {
    const id = `${key}:${ip}`;
    const current = Date.now();
    let bucket = buckets.get(id);
    if (!bucket || bucket.reset <= current) {
        bucket = {count: 0, reset: current + windowMs};
        buckets.set(id, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
};

setInterval(() => {
    const current = Date.now();
    for (const [key, bucket] of buckets) {
        if (bucket.reset <= current) buckets.delete(key);
    }
    while (buckets.size > 20000) {
        const oldest = buckets.keys().next().value;
        if (!oldest) break;
        buckets.delete(oldest);
    }
}, 60 * 1000).unref();

const bearerToken = req => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim();
    return '';
};

const requireUser = (req, res) => {
    const token = bearerToken(req);
    const found = store.getSession(token);
    if (!found) {
        sendJson(res, 401, {error: '请先登录 PointerE 账号', code: 'auth'});
        return null;
    }
    return {...found, token};
};

const requireAdmin = (req, res) => {
    const found = requireUser(req, res);
    if (!found) return null;
    if (found.session.kind !== 'admin' || found.user.role !== 'admin') {
        sendJson(res, 403, {error: '需要管理员权限'});
        return null;
    }
    return found;
};

const serveStatic = (res, relative) => {
    const filePath = path.resolve(PUBLIC_DIR, relative);
    const root = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(root)) {
        sendJson(res, 404, {error: 'Not found'});
        return;
    }
    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendJson(res, 404, {error: 'Not found'});
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const isExtensionAsset = relative.startsWith('extensions/');
        const headers = {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': isExtensionAsset ? 'public, max-age=300' : 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-Robots-Tag': 'noindex, nofollow'
        };
        if (isExtensionAsset) {
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
        }
        if (ext === '.html') headers['Content-Security-Policy'] = CSP;
        res.writeHead(200, headers);
        res.end(data);
    });
};

const page = ({title, body}) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/app.css">
</head>
<body class="simple-page">
${body}
</body>
</html>`;

/* ------------------------------------------------------------------ */
/* Account routes                                                      */
/* ------------------------------------------------------------------ */

const validUsername = value => /^[A-Za-z0-9_]{3,20}$/.test(value);
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
const hidden = () => '••••••••';

const authFailures = new Map();
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH = crypto.scryptSync('pointer-invalid-password', DUMMY_SALT, 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
}).toString('hex');

const authFailureKey = (ip, account) => (
    `${ip}:${crypto.createHash('sha256').update(String(account || '').toLowerCase()).digest('hex').slice(0, 20)}`
);
const authFailureBlocked = key => {
    const entry = authFailures.get(key);
    if (!entry) return false;
    if (entry.until <= Date.now()) {
        authFailures.delete(key);
        return false;
    }
    return entry.count >= 8;
};
const recordAuthFailure = key => {
    const current = Date.now();
    const entry = authFailures.get(key);
    if (!entry || entry.until <= current) {
        authFailures.set(key, {count: 1, until: current + 15 * 60 * 1000});
    } else {
        entry.count += 1;
    }
};
const clearAuthFailure = key => authFailures.delete(key);
const verifyLoginPassword = (user, password) => {
    if (!user) {
        store.verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
        return false;
    }
    return store.verifyPassword(password, user.salt, user.passwordHash);
};
setInterval(() => {
    const current = Date.now();
    for (const [key, entry] of authFailures) {
        if (entry.until <= current) authFailures.delete(key);
    }
}, 10 * 60 * 1000).unref();

const publicSmtp = () => {
    const {smtp} = store.getConfig();
    return {
        host: smtp.host,
        port: smtp.port,
        secure: Boolean(smtp.secure),
        user: smtp.user,
        fromName: smtp.fromName,
        hasPassword: Boolean(smtp.pass),
        password: smtp.pass ? hidden() : ''
    };
};

const verificationLink = token => `${PUBLIC_BASE.replace(/\/+$/, '')}/verify?token=${encodeURIComponent(token)}`;

const queueVerification = user => {
    const token = store.createVerifyToken(user.id);
    const link = verificationLink(token);
    mailer.sendVerification({email: user.email, username: user.username, link})
        .then(result => {
            if (result.ok) {
                console.log(`[account] verification mail sent to ${user.email}`);
            } else {
                console.error(`[account] verification mail for ${user.username} not sent: ${result.error || 'smtp not configured'}`);
                if (result.configured === false) {
                    console.error(`[account] verification link (SMTP not configured): ${link}`);
                }
            }
        })
        .catch(error => console.error('[account] mail error:', error && error.message));
};

const handleCaptcha = (req, res) => {
    if (!rateLimit(clientIp(req), 'captcha', 60, 10 * 60 * 1000)) {
        sendJson(res, 429, {error: '请求过于频繁，请稍后再试'});
        return;
    }
    sendJson(res, 200, captcha.createCaptcha(store.getConfig().captchaSecret));
};

const handleRegister = async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(ip, 'register', 6, 60 * 60 * 1000)) {
        sendJson(res, 429, {error: '注册过于频繁，请稍后再试'});
        return;
    }
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const captchaId = String(body.captchaId || '');
    const captchaAnswer = String(body.captchaAnswer || '');

    if (!validUsername(username)) {
        sendJson(res, 400, {error: '用户名需为 3-20 位字母、数字或下划线'});
        return;
    }
    if (!validEmail(email)) {
        sendJson(res, 400, {error: '邮箱格式不正确'});
        return;
    }
    if (password.length < 8 || password.length > 128) {
        sendJson(res, 400, {error: '密码长度需为 8-128 位'});
        return;
    }
    if (!captcha.verifyToken(store.getConfig().captchaSecret, captchaId, captchaAnswer)) {
        sendJson(res, 400, {error: '图形验证码错误或已过期'});
        return;
    }
    if (store.findByUsername(username)) {
        sendJson(res, 409, {error: '该用户名已被使用'});
        return;
    }
    if (store.findByEmail(email)) {
        sendJson(res, 409, {error: '该邮箱已注册'});
        return;
    }
    const user = store.createUser({username, email, password, verified: false});
    queueVerification(user);
    sendJson(res, 201, {
        ok: true,
        message: '注册成功，验证邮件已发送，请查收邮箱',
        user: store.publicUser(user)
    });
};

const handleLogin = async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(ip, 'login', 15, 15 * 60 * 1000)) {
        sendJson(res, 429, {error: '登录尝试过于频繁，请稍后再试'});
        return;
    }
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const account = String(body.account || body.username || '').trim();
    const password = String(body.password || '');
    if (!account || !password || account.length > 254 || password.length > 256) {
        sendJson(res, 400, {error: '请输入账号和密码'});
        return;
    }
    const failKey = authFailureKey(ip, account);
    if (authFailureBlocked(failKey)) {
        sendJson(res, 429, {error: '登录尝试过于频繁，请稍后再试'});
        return;
    }
    const user = store.findByUsername(account) || store.findByEmail(account);
    if (!verifyLoginPassword(user, password)) {
        recordAuthFailure(failKey);
        sendJson(res, 401, {error: '账号或密码错误'});
        return;
    }
    clearAuthFailure(failKey);
    if (user.disabled) {
        sendJson(res, 403, {error: '该账号已被停用，请联系管理员'});
        return;
    }
    if (!user.verified) {
        sendJson(res, 403, {error: '请先完成邮箱验证', code: 'unverified'});
        return;
    }
    const token = store.createSession(user.id, 'user');
    store.updateUser(user.id, {lastLoginAt: Date.now()});
    sendJson(res, 200, {token, user: store.publicUser(user)});
};

const handleResend = async (req, res) => {
    if (!rateLimit(clientIp(req), 'resend', 5, 30 * 60 * 1000)) {
        sendJson(res, 429, {error: '操作过于频繁，请稍后再试'});
        return;
    }
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const email = String(body.email || '').trim().toLowerCase();
    const user = store.findByEmail(email);
    if (user && !user.verified && !user.disabled) queueVerification(user);
    sendJson(res, 200, {ok: true, message: '如果该邮箱已注册，验证邮件会很快送达'});
};

const pointsPayload = user => {
    const orders = store.getUserOrders(user.id);
    const today = store.chinaDateKey();
    return {
        points: Number(user.points) || 0,
        products: store.getProducts(),
        orders,
        address: user.shippingAddress || null,
        registration: {
            amount: store.POINTS.REGISTER,
            awarded: Boolean(user.registrationPointsAwarded)
        },
        dailyCode: {
            amount: store.POINTS.DAILY_CODE,
            claimed: user.dailyCodeDate === today,
            date: today
        },
        history: Array.isArray(user.pointsHistory) ? user.pointsHistory.slice(0, 100) : []
    };
};

const handleGetPoints = (req, res) => {
    const found = requireUser(req, res);
    if (!found) return;
    sendJson(res, 200, pointsPayload(found.user));
};

const handleCodeActivity = async (req, res) => {
    if (!rateLimit(clientIp(req), 'code-points', 30, 60 * 60 * 1000)) {
        sendJson(res, 429, {error: '请求过于频繁'});
        return;
    }
    const found = requireUser(req, res);
    if (!found) return;
    const result = store.claimDailyCodePoints(found.user.id);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, result);
};

const handleSaveAddress = async (req, res) => {
    if (!rateLimit(clientIp(req), 'address', 20, 60 * 60 * 1000)) {
        sendJson(res, 429, {error: '操作过于频繁'});
        return;
    }
    const found = requireUser(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const result = store.saveShippingAddress(found.user.id, body.address || body);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {ok: true, address: result.address});
};

const handleRedeem = async (req, res) => {
    if (!rateLimit(clientIp(req), 'redeem', 20, 60 * 60 * 1000)) {
        sendJson(res, 429, {error: '兑换过于频繁，请稍后再试'});
        return;
    }
    const found = requireUser(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const productId = String(body.productId || '');
    const result = store.redeemProduct(found.user.id, productId, body.address);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {
        ok: true,
        order: result.order,
        points: result.points,
        summary: pointsPayload(store.findById(found.user.id))
    });
};

const handleAdminOrders = (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    sendJson(res, 200, {orders: store.listOrders()});
};

const handleAdminOrderStatus = async (req, res, orderId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const order = store.updateOrderStatus(orderId, String(body.status || ''));
    if (!order) {
        sendJson(res, 400, {error: '订单或状态不正确'});
        return;
    }
    sendJson(res, 200, {ok: true, order});
};

const handleAdminProducts = (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    sendJson(res, 200, {products: store.listAllProducts()});
};

const handleAdminProductCreate = async (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const result = store.createProduct(body);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {ok: true, product: result.product});
};

const handleAdminProductUpdate = async (req, res, productId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const result = store.updateProduct(productId, body);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {ok: true, product: result.product});
};

const handleAdminProductDelete = (req, res, productId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    if (!store.deleteProduct(productId)) {
        sendJson(res, 404, {error: '商品不存在'});
        return;
    }
    sendJson(res, 200, {ok: true});
};

const handleAdminUserPoints = async (req, res, userId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount === 0) {
        sendJson(res, 400, {error: '调整数量必须是非零整数'});
        return;
    }
    if (Math.abs(amount) > 1000000) {
        sendJson(res, 400, {error: '单次调整不能超过 1000000 积分'});
        return;
    }
    const reason = String(body.reason || '').trim().slice(0, 120);
    if (!reason) {
        sendJson(res, 400, {error: '请填写调整原因'});
        return;
    }
    const target = store.findById(userId);
    if (!target) {
        sendJson(res, 404, {error: '用户不存在'});
        return;
    }
    if (target.role === 'admin') {
        sendJson(res, 400, {error: '管理员账号不需要调整积分'});
        return;
    }
    const user = store.awardPoints(userId, amount, `管理员调整：${reason}`, {
        source: 'admin',
        admin: found.user.username,
        reason
    });
    if (!user) {
        sendJson(res, 400, {error: '调整后积分没有变化'});
        return;
    }
    sendJson(res, 200, {
        ok: true,
        points: user.points,
        user: store.publicUser(user),
        entry: Array.isArray(user.pointsHistory) ? user.pointsHistory[0] : null
    });
};

const handlePublicNotices = (req, res) => {
    if (!rateLimit(clientIp(req), 'notices', 120, 60 * 1000)) {
        sendJson(res, 429, {error: '请求过于频繁'});
        return;
    }
    sendJson(res, 200, {
        announcements: store.listActiveNotices(),
        release: store.getRelease()
    });
};

const handleAdminNotices = (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    sendJson(res, 200, {
        announcements: store.listNotices(),
        release: store.getRelease()
    });
};

const handleAdminNoticeCreate = async (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const result = store.createNotice(body);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {ok: true, notice: result.notice});
};

const handleAdminNoticeUpdate = async (req, res, noticeId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const result = store.updateNotice(noticeId, body);
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {ok: true, notice: result.notice});
};

const handleAdminNoticeDelete = (req, res, noticeId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    if (!store.deleteNotice(noticeId)) {
        sendJson(res, 404, {error: '公告不存在'});
        return;
    }
    sendJson(res, 200, {ok: true});
};

const handleAdminRelease = async (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const result = store.saveRelease(body || {});
    if (result.error) {
        sendJson(res, 400, {error: result.error});
        return;
    }
    sendJson(res, 200, {ok: true, release: result.release});
};

const handleVerify = (req, res, url) => {
    const token = url.searchParams.get('token') || '';
    const user = store.findUserByVerifyToken(token);
    if (!user) {
        sendHtml(res, 400, page({
            title: '验证失败',
            body: `<main class="simple-card"><h1>验证链接无效或已过期</h1><p>请回到 PointerE 注册页重新获取验证邮件，或联系管理员。</p><p><a class="button-link" href="/register">返回注册页</a></p></main>`
        }));
        return;
    }
    if (user.verifyTokenExpires && user.verifyTokenExpires < Date.now()) {
        sendHtml(res, 400, page({
            title: '验证已过期',
            body: `<main class="simple-card"><h1>验证链接已过期</h1><p>请返回注册页重新发送验证邮件，或联系站点维护者。</p><p><a class="button-link" href="/register">返回注册页</a></p></main>`
        }));
        return;
    }
    store.markVerified(user.id);
    sendHtml(res, 200, page({
        title: '验证成功',
        body: `<main class="simple-card"><div class="success-badge">验证成功</div><h1>${escapeHtml(displayName(user))}，邮箱已验证</h1><p>注册奖励 ${store.POINTS.REGISTER} 积分已到账。现在可以回到 PointerEditor，在「云端 → 在线协作」中使用 PointerE 账号登录。</p><p><a class="button-link" href="/">返回首页</a></p></main>`
    }));
};

/* ------------------------------------------------------------------ */
/* Admin routes                                                        */
/* ------------------------------------------------------------------ */

const handleAdminLogin = async (req, res) => {
    if (!rateLimit(clientIp(req), 'admin-login', 8, 15 * 60 * 1000)) {
        sendJson(res, 429, {error: '登录尝试过于频繁，请稍后再试'});
        return;
    }
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const account = String(body.account || body.username || '').trim();
    const password = String(body.password || '');
    if (!account || !password || account.length > 254 || password.length > 256) {
        sendJson(res, 401, {error: '管理员账号或密码错误'});
        return;
    }
    const failKey = authFailureKey(clientIp(req), `admin:${account}`);
    if (authFailureBlocked(failKey)) {
        sendJson(res, 429, {error: '登录尝试过于频繁，请稍后再试'});
        return;
    }
    const user = store.findByUsername(account) || store.findByEmail(account);
    if (!verifyLoginPassword(user, password) || user.role !== 'admin') {
        recordAuthFailure(failKey);
        sendJson(res, 401, {error: '管理员账号或密码错误'});
        return;
    }
    clearAuthFailure(failKey);
    if (user.disabled) {
        sendJson(res, 403, {error: '该管理员账号已被停用'});
        return;
    }
    const token = store.createSession(user.id, 'admin');
    store.updateUser(user.id, {lastLoginAt: Date.now()});
    sendJson(res, 200, {token, user: store.publicUser(user)});
};

const handleAdminUsers = (req, res, url) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const query = String(url.searchParams.get('query') || '').trim().toLowerCase();
    let users = store.listUsers();
    if (query) {
        users = users.filter(user => (
            user.username.toLowerCase().includes(query) ||
            (user.email || '').toLowerCase().includes(query) ||
            (user.nickname || '').toLowerCase().includes(query)
        ));
    }
    users.sort((a, b) => b.createdAt - a.createdAt);
    sendJson(res, 200, {users, stats: store.stats(), rooms: getRoomsInfo()});
};

const handleAdminUserAction = async (req, res, userId) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const action = String(body.action || '');
    const user = store.findById(userId);
    if (!user) {
        sendJson(res, 404, {error: '用户不存在'});
        return;
    }
    if (user.id === found.user.id && ['disable', 'delete'].includes(action)) {
        sendJson(res, 400, {error: '不能停用或删除当前管理员账号'});
        return;
    }
    if (user.role === 'admin' && action === 'delete' && store.stats().admins <= 1) {
        sendJson(res, 400, {error: '至少需要保留一个管理员账号'});
        return;
    }
    switch (action) {
    case 'verify':
        store.markVerified(user.id);
        break;
    case 'disable':
        store.updateUser(user.id, {disabled: true});
        break;
    case 'enable':
        store.updateUser(user.id, {disabled: false});
        break;
    case 'delete':
        store.deleteUser(user.id);
        break;
    case 'resend':
        if (!user.email) {
            sendJson(res, 400, {error: '该账号没有绑定邮箱'});
            return;
        }
        queueVerification(user);
        break;
    case 'reset-password': {
        const tempPassword = crypto.randomBytes(9).toString('base64url');
        store.setPassword(user.id, tempPassword);
        sendJson(res, 200, {ok: true, tempPassword, message: '密码已重置，请把临时密码发送给用户'});
        return;
    }
    default:
        sendJson(res, 400, {error: '未知操作'});
        return;
    }
    sendJson(res, 200, {ok: true, user: store.publicUser(store.findById(userId) || user)});
};

const handleAdminSmtp = async (req, res, write) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    if (!write) {
        const {smtp} = store.getConfig();
        sendJson(res, 200, {
            smtp: publicSmtp(),
            publicBaseUrl: PUBLIC_BASE,
            configured: Boolean(smtp.user && smtp.pass)
        });
        return;
    }
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    if (body.action === 'test') {
        const result = await mailer.verifyConnection();
        sendJson(res, result.ok ? 200 : 400, result);
        return;
    }
    const current = store.getConfig().smtp;
    const next = {
        host: String(body.host || current.host).trim(),
        port: Number(body.port || current.port),
        secure: body.secure !== false,
        user: String(body.user || '').trim(),
        pass: typeof body.pass === 'string' && body.pass && body.pass !== hidden() ? body.pass : current.pass,
        fromName: String(body.fromName || current.fromName || 'PointerE').trim()
    };
    if (!next.host || !Number.isFinite(next.port) || next.port <= 0) {
        sendJson(res, 400, {error: 'SMTP 主机或端口不正确'});
        return;
    }
    store.saveConfig({smtp: next});
    sendJson(res, 200, {ok: true, smtp: publicSmtp()});
};

const handleAdminRooms = (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    sendJson(res, 200, {rooms: getRoomsInfo(), stats: store.stats()});
};

/* ------------------------------------------------------------------ */
/* Community extension submissions                                     */
/* ------------------------------------------------------------------ */

const EXTENSION_ID_RE = /^[A-Za-z][A-Za-z0-9_]{2,40}$/;

const isPrivateAddress = address => {
    const ip = String(address || '').toLowerCase();
    if (net.isIPv4(ip)) {
        return ip === '0.0.0.0' ||
            /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
    }
    if (net.isIPv6(ip)) {
        return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
    }
    return true;
};

const fetchExtensionSource = async rawUrl => {
    let url;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch (error) {
        throw new Error('扩展地址格式不正确');
    }
    if (url.protocol !== 'https:') throw new Error('扩展地址必须使用 https://');
    if (!url.hostname || /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) {
        throw new Error('扩展地址不能指向本机或内网');
    }
    let addresses;
    try {
        addresses = await dns.promises.lookup(url.hostname, {all: true, verbatim: true});
    } catch (error) {
        throw new Error('无法解析扩展地址');
    }
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
        throw new Error('扩展地址不能指向内网');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(url.href, {
            redirect: 'error',
            signal: controller.signal,
            headers: {
                'User-Agent': 'PointerEditor-ExtensionBot/1.0',
                Accept: 'text/javascript, application/javascript, text/plain, */*;q=0.5'
            }
        });
        if (!response.ok) throw new Error(`读取扩展失败（${response.status}）`);
        const type = String(response.headers.get('content-type') || '');
        if (type && !/javascript|ecmascript|text\/plain|octet-stream/i.test(type)) {
            throw new Error('该地址返回的不是 JavaScript 文件');
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 20) throw new Error('扩展源码为空');
        if (buffer.length > 512 * 1024) throw new Error('扩展源码超过 512KB 限制');
        const text = buffer.toString('utf8');
        if (!/Scratch\.extensions\.register/.test(text)) {
            throw new Error('源码中没有找到 Scratch.extensions.register');
        }
        return {text, finalUrl: url.href};
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('读取扩展地址超时');
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const MAX_EXTENSION_ICON_BYTES = 256 * 1024;

const detectImageType = buffer => {
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
        return {ext: 'png', mime: 'image/png'};
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return {ext: 'jpg', mime: 'image/jpeg'};
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.subarray(8, 12).toString() === 'WEBP') {
        return {ext: 'webp', mime: 'image/webp'};
    }
    return null;
};

const parseIconUpload = raw => {
    const text = String(raw || '');
    if (!text) return null;
    const comma = text.indexOf(',');
    const base64 = comma >= 0 ? text.slice(comma + 1) : text;
    let buffer;
    try {
        buffer = Buffer.from(base64, 'base64');
    } catch (error) {
        throw new Error('扩展图片格式不正确');
    }
    if (!buffer.length) return null;
    if (buffer.length > MAX_EXTENSION_ICON_BYTES) throw new Error('扩展图片不能超过 256KB');
    const type = detectImageType(buffer);
    if (!type) throw new Error('扩展图片仅支持 PNG、JPG 或 WEBP');
    return {buffer, ...type};
};

const validateUploadedSource = text => {
    const source = String(text || '');
    if (source.length < 20) throw new Error('扩展源码为空');
    if (Buffer.byteLength(source, 'utf8') > 512 * 1024) throw new Error('扩展源码超过 512KB 限制');
    if (!/Scratch\.extensions\.register/.test(source)) {
        throw new Error('源码中没有找到 Scratch.extensions.register');
    }
    return source;
};

const CTSPACE_EXTENSIONS_API = 'https://forum.ctspace.xyz/api/extensions?sort=score&page=1';
let ctspaceCache = {at: 0, listed: []};

const parseExtensionMeta = code => {
    const get = key => {
        const match = String(code || '').match(new RegExp(`^\\s*//\\s*${key}\\s*[:：]\\s*(.+)$`, 'im'));
        return match ? match[1].trim() : '';
    };
    return {
        name: get('Name'),
        id: get('ID'),
        description: get('Description'),
        author: get('By') || get('Author')
    };
};

const loadCtspaceExtensions = async () => {
    if (Date.now() - ctspaceCache.at < 5 * 60 * 1000 && ctspaceCache.listed.length) {
        return ctspaceCache.listed;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(CTSPACE_EXTENSIONS_API, {
            signal: controller.signal,
            headers: {'User-Agent': 'PointerEditor-ExtensionBot/1.0', Accept: 'application/json'}
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const listed = (Array.isArray(data.items) ? data.items : [])
            .filter(item => item && item.id && /Scratch\.extensions\.register/.test(String(item.code || '')))
            .map(item => {
                const meta = parseExtensionMeta(item.code);
                return {
                    forumId: item.id,
                    id: meta.id || `ct_${item.id}`,
                    name: meta.name || item.title || '未命名扩展',
                    description: meta.description || item.summary || '来自创客次元的社区扩展',
                    author: meta.author || (item.author && (item.author.nickname || item.author.username)) || '创客次元作者',
                    category: item.category || 'community',
                    code: item.code
                };
            });
        ctspaceCache = {at: Date.now(), listed};
        return listed;
    } catch (error) {
        return ctspaceCache.listed;
    } finally {
        clearTimeout(timer);
    }
};

const handleExtensionSubmit = async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(ip, 'extension-submit', 5, 60 * 60 * 1000)) {
        sendJson(res, 429, {error: '提交过于频繁，请稍后再试'});
        return;
    }
    let body;
    try {
        body = await readBody(req, 3 * 1024 * 1024);
    } catch (error) {
        sendJson(res, error.status || 400, {error: error.message});
        return;
    }
    const captchaId = String(body.captchaId || '');
    const captchaAnswer = String(body.captchaAnswer || '');
    if (!captcha.verifyToken(store.getConfig().captchaSecret, captchaId, captchaAnswer)) {
        sendJson(res, 400, {error: '图形验证码错误或已过期'});
        return;
    }
    const extensionId = String(body.extensionId || '').trim();
    const name = String(body.name || '').trim();
    const author = String(body.author || '').trim();
    const description = String(body.description || '').trim();
    const sourceUrl = String(body.sourceUrl || '').trim();
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const uploadedName = String(body.sourceName || '').trim().slice(0, 120);
    const contact = String(body.contact || '').trim();
    const tags = String(body.tags || '')
        .split(/[,，\s]+/)
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 5);
    if (!EXTENSION_ID_RE.test(extensionId)) {
        sendJson(res, 400, {error: '扩展 ID 需为 3-40 位字母开头，可含数字和下划线'});
        return;
    }
    if (name.length < 1 || name.length > 60) {
        sendJson(res, 400, {error: '扩展名称需为 1-60 个字符'});
        return;
    }
    if (author.length < 1 || author.length > 40) {
        sendJson(res, 400, {error: '作者名需为 1-40 个字符'});
        return;
    }
    if (description.length < 10 || description.length > 600) {
        sendJson(res, 400, {error: '扩展介绍需为 10-600 个字符'});
        return;
    }
    if (!sourceText && !sourceUrl) {
        sendJson(res, 400, {error: '请上传扩展 JS 文件或填写扩展地址'});
        return;
    }
    if (store.findCommunityExtension(extensionId) ||
        store.listExtensionSubmissions().some(item => item.extensionId === extensionId && item.status !== 'rejected')) {
        sendJson(res, 409, {error: '该扩展 ID 已存在或正在审核'});
        return;
    }
    let icon = null;
    try {
        icon = parseIconUpload(body.iconData);
    } catch (error) {
        sendJson(res, 400, {error: error.message});
        return;
    }
    let source;
    try {
        source = sourceText ? {
            text: validateUploadedSource(sourceText),
            finalUrl: uploadedName || '直接上传'
        } : await fetchExtensionSource(sourceUrl);
    } catch (error) {
        sendJson(res, 400, {error: error.message});
        return;
    }
    const submission = store.createExtensionSubmission({
        extensionId,
        name,
        author,
        contact,
        description,
        tags,
        sourceUrl: source.finalUrl,
        ip
    });
    const fileName = `${submission.id}.js`;
    let iconFile = '';
    try {
        await fs.promises.writeFile(path.join(EXTENSION_SUBMISSION_DIR, fileName), source.text, {mode: 0o600});
        if (icon) {
            iconFile = `${submission.id}-icon.${icon.ext}`;
            await fs.promises.writeFile(path.join(EXTENSION_SUBMISSION_DIR, iconFile), icon.buffer, {mode: 0o600});
        }
        store.updateExtensionSubmission(submission.id, {
            sourceFile: fileName,
            iconFile,
            iconMime: icon ? icon.mime : ''
        });
    } catch (error) {
        if (iconFile) fs.unlink(path.join(EXTENSION_SUBMISSION_DIR, iconFile), () => {});
        fs.unlink(path.join(EXTENSION_SUBMISSION_DIR, fileName), () => {});
        store.deleteExtensionSubmission(submission.id);
        sendJson(res, 500, {error: '保存扩展文件失败'});
        return;
    }
    sendJson(res, 201, {
        ok: true,
        message: '提交成功，审核通过后会出现在社区扩展中',
        submission: {id: submission.id, extensionId, name, status: 'pending'}
    });
};

const handleCommunityExtensions = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const own = store.listCommunityExtensions().map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        author: item.author,
        tags: item.tags || [],
        iconURL: item.iconURL || '',
        url: item.url
    }));
    const known = new Set(own.map(item => item.id));
    const ctspace = (await loadCtspaceExtensions())
        .filter(item => !known.has(item.id))
        .map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            author: `${item.author}（创客次元）`,
            tags: ['创客次元'],
            iconURL: '',
            url: `${PUBLIC_BASE}/ctspace-extensions/${item.forumId}.js`
        }));
    sendJson(res, 200, {items: ctspace.concat(own)});
};

const handleAdminExtensions = async (req, res) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const submissions = await Promise.all(store.listExtensionSubmissions().map(async item => {
        let iconData = '';
        if (item.iconFile) {
            try {
                const buffer = await fs.promises.readFile(path.join(EXTENSION_SUBMISSION_DIR, path.basename(item.iconFile)));
                iconData = `data:${item.iconMime || 'image/png'};base64,${buffer.toString('base64')}`;
            } catch (error) {
                iconData = '';
            }
        }
        return {...item, iconData};
    }));
    sendJson(res, 200, {
        submissions,
        approved: store.listCommunityExtensions()
    });
};

const handleAdminExtensionSource = (req, res, id) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const submission = store.findExtensionSubmission(id);
    if (!submission || !submission.sourceFile) {
        sendJson(res, 404, {error: '提交不存在'});
        return;
    }
    fs.readFile(path.join(EXTENSION_SUBMISSION_DIR, path.basename(submission.sourceFile)), 'utf8', (error, source) => {
        if (error) {
            sendJson(res, 404, {error: '源码文件不存在'});
            return;
        }
        sendJson(res, 200, {submission, source: source.slice(0, 600 * 1024)});
    });
};

const handleAdminExtensionApprove = async (req, res, id) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const submission = store.findExtensionSubmission(id);
    if (!submission) {
        sendJson(res, 404, {error: '提交不存在'});
        return;
    }
    if (!submission.sourceFile) {
        sendJson(res, 400, {error: '缺少源码文件'});
        return;
    }
    const sourcePath = path.join(EXTENSION_SUBMISSION_DIR, path.basename(submission.sourceFile));
    const fileName = `${submission.extensionId}.js`;
    const publicPath = path.join(COMMUNITY_EXTENSION_DIR, fileName);
    try {
        const source = await fs.promises.readFile(sourcePath);
        await fs.promises.writeFile(publicPath, source);
        let iconURL = '';
        if (submission.iconFile) {
            const iconPath = path.join(EXTENSION_SUBMISSION_DIR, path.basename(submission.iconFile));
            const iconExt = path.extname(iconPath).toLowerCase();
            if (['.png', '.jpg', '.webp'].includes(iconExt)) {
                const publicIcon = `${submission.extensionId}-icon${iconExt}`;
                await fs.promises.copyFile(iconPath, path.join(COMMUNITY_EXTENSION_DIR, publicIcon));
                iconURL = `${PUBLIC_BASE}/community-extensions/${publicIcon}`;
            }
        }
        const entry = store.addCommunityExtension({
            id: submission.extensionId,
            name: submission.name,
            description: submission.description,
            author: submission.author,
            tags: submission.tags,
            url: `${PUBLIC_BASE}/community-extensions/${fileName}`,
            iconURL,
            submissionId: submission.id
        });
        store.updateExtensionSubmission(submission.id, {
            status: 'approved',
            approvedAt: Date.now(),
            publicUrl: entry.url,
            note: ''
        });
        sendJson(res, 200, {ok: true, entry});
    } catch (error) {
        sendJson(res, 500, {error: '发布扩展文件失败'});
    }
};

const handleAdminExtensionReject = async (req, res, id) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const submission = store.findExtensionSubmission(id);
    if (!submission) {
        sendJson(res, 404, {error: '提交不存在'});
        return;
    }
    let body = {};
    try {
        body = await readBody(req);
    } catch (error) {
        body = {};
    }
    store.updateExtensionSubmission(id, {
        status: 'rejected',
        note: String(body.note || '').trim().slice(0, 300)
    });
    sendJson(res, 200, {ok: true});
};

const handleAdminExtensionDelete = (req, res, id) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const submission = store.findExtensionSubmission(id);
    if (!submission) {
        sendJson(res, 404, {error: '提交不存在'});
        return;
    }
    if (submission.sourceFile) {
        fs.unlink(path.join(EXTENSION_SUBMISSION_DIR, path.basename(submission.sourceFile)), () => {});
    }
    if (submission.iconFile) {
        fs.unlink(path.join(EXTENSION_SUBMISSION_DIR, path.basename(submission.iconFile)), () => {});
    }
    const entry = submission.status === 'approved' ?
        store.listCommunityExtensions().find(item => item.submissionId === id) : null;
    if (entry) {
        store.deleteCommunityExtension(entry.id);
        fs.unlink(path.join(COMMUNITY_EXTENSION_DIR, `${entry.id}.js`), () => {});
        for (const ext of ['png', 'jpg', 'webp']) {
            fs.unlink(path.join(COMMUNITY_EXTENSION_DIR, `${entry.id}-icon.${ext}`), () => {});
        }
    }
    store.deleteExtensionSubmission(id);
    sendJson(res, 200, {ok: true});
};

const handleAdminCommunityDelete = (req, res, id) => {
    const found = requireAdmin(req, res);
    if (!found) return;
    const entry = store.findCommunityExtension(id);
    if (!entry) {
        sendJson(res, 404, {error: '扩展不存在'});
        return;
    }
    store.deleteCommunityExtension(id);
    fs.unlink(path.join(COMMUNITY_EXTENSION_DIR, `${id}.js`), () => {});
    for (const ext of ['png', 'jpg', 'webp']) {
        fs.unlink(path.join(COMMUNITY_EXTENSION_DIR, `${id}-icon.${ext}`), () => {});
    }
    sendJson(res, 200, {ok: true});
};

/* ------------------------------------------------------------------ */
/* WebSocket relay                                                     */
/* ------------------------------------------------------------------ */

const normalizeRoom = value => String(value || '').trim().toUpperCase();
const validRoom = value => /^[A-Z0-9]{4,12}$/.test(value);
const normalizeName = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24) || '访客';
const normalizeRoomSecret = value => String(value || '').trim().slice(0, 24);
const hashRoomSecret = value => crypto
    .createHash('sha256')
    .update(`pointer-room:${value}`)
    .digest('hex');
const roomSecretMatches = (hash, secret) => {
    const given = Buffer.from(hashRoomSecret(secret));
    const expected = Buffer.from(String(hash || ''));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

const totalClients = () => {
    let count = 0;
    for (const room of rooms.values()) count += room.clients.size;
    return count;
};

const encodeFrame = (opcode, payload) => {
    const length = payload.length;
    let header;
    if (length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | opcode;
        header[1] = length;
    } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(length, 6);
    }
    return Buffer.concat([header, payload]);
};

class Client {
    constructor (socket) {
        this.id = String(nextClientId++);
        this.socket = socket;
        this.user = null;
        this.name = '访客';
        this.roomId = null;
        this.alive = true;
        this.closed = false;
        this.buffer = Buffer.alloc(0);
        this.fragments = [];
        this.fragmentBytes = 0;
        this.fragmentOpcode = 0;
        this.messageCount = 0;
        this.messageWindowStart = Date.now();
        this.failedJoins = 0;
        this.claimTimes = [];
        this.blockTimes = [];
        this.stateTimes = [];
        this.lockRequestTimes = [];
        this.ip = '';
    }

    sendJSON (payload) {
        this.sendText(JSON.stringify(payload));
    }

    sendText (text) {
        if (this.closed) return;
        this.write(encodeFrame(0x1, Buffer.from(text, 'utf8')));
    }

    ping () {
        if (this.closed) return;
        this.write(encodeFrame(0x9, Buffer.alloc(0)));
    }

    write (frame) {
        if (this.closed) return;
        if (this.socket.writableLength > MAX_MESSAGE_BYTES * 2) {
            this.terminate('backpressure');
            return;
        }
        try {
            this.socket.write(frame);
        } catch (error) {
            this.terminate('write-error');
        }
    }

    close (code = 1000, reason = '') {
        if (this.closed) return;
        const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
        payload.writeUInt16BE(code, 0);
        payload.write(reason, 2);
        try {
            this.socket.write(encodeFrame(0x8, payload));
            this.socket.end();
        } catch (error) {
            // ignored
        }
        this.terminate(reason || 'closed');
    }

    terminate (reason) {
        if (this.closed) return;
        this.closed = true;
        try {
            this.socket.destroy();
        } catch (error) {
            // ignored
        }
        leaveRoom(this, reason);
    }

    onData (chunk) {
        this.alive = true;
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 2) {
            const first = this.buffer[0];
            const second = this.buffer[1];
            const fin = (first & 0x80) !== 0;
            const opcode = first & 0x0f;
            const masked = (second & 0x80) !== 0;
            let length = second & 0x7f;
            let offset = 2;
            if (length === 126) {
                if (this.buffer.length < 4) return;
                length = this.buffer.readUInt16BE(2);
                offset = 4;
            } else if (length === 127) {
                if (this.buffer.length < 10) return;
                const high = this.buffer.readUInt32BE(2);
                const low = this.buffer.readUInt32BE(6);
                if (high !== 0) {
                    this.close(1009, 'message too big');
                    return;
                }
                length = low;
                offset = 10;
            }
            if (length > MAX_MESSAGE_BYTES) {
                this.close(1009, 'message too big');
                return;
            }
            let maskKey = null;
            if (masked) {
                if (this.buffer.length < offset + 4) return;
                maskKey = this.buffer.subarray(offset, offset + 4);
                offset += 4;
            }
            if (this.buffer.length < offset + length) return;
            const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
            this.buffer = this.buffer.subarray(offset + length);
            if (maskKey) {
                for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];
            }
            this.handleFrame(fin, opcode, payload);
            if (this.closed) return;
        }
    }

    handleFrame (fin, opcode, payload) {
        if (opcode === 0x8) {
            this.close(1000, 'bye');
            return;
        }
        if (opcode === 0x9) {
            this.write(encodeFrame(0xA, payload));
            return;
        }
        if (opcode === 0xA) {
            this.alive = true;
            return;
        }
        if (opcode === 0x1 || opcode === 0x2) {
            this.fragments = [payload];
            this.fragmentBytes = payload.length;
            this.fragmentOpcode = opcode;
        } else if (opcode === 0x0) {
            if (!this.fragments.length) return;
            if (this.fragmentBytes + payload.length > MAX_MESSAGE_BYTES) {
                this.fragments = [];
                this.fragmentBytes = 0;
                this.close(1009, 'message too big');
                return;
            }
            this.fragments.push(payload);
            this.fragmentBytes += payload.length;
        } else {
            return;
        }
        if (!fin) return;
        const full = Buffer.concat(this.fragments);
        const messageOpcode = this.fragmentOpcode;
        this.fragments = [];
        this.fragmentBytes = 0;
        this.fragmentOpcode = 0;
        if (messageOpcode !== 0x1) return;
        this.handleMessage(full.toString('utf8'));
    }

    handleMessage (text) {
        const current = Date.now();
        if (current - this.messageWindowStart > WS_MESSAGE_WINDOW_MS) {
            this.messageWindowStart = current;
            this.messageCount = 0;
        }
        this.messageCount += 1;
        if (this.messageCount > WS_MESSAGE_LIMIT) {
            this.close(1008, 'rate limit');
            return;
        }
        let message;
        try {
            message = JSON.parse(text);
        } catch (error) {
            this.sendJSON({type: 'error', message: '消息格式错误'});
            return;
        }
        if (!message || typeof message.type !== 'string') return;
        switch (message.type) {
        case 'join':
            joinRoom(this, message);
            break;
        case 'state':
            handleState(this, message);
            break;
        case 'state-request':
            handleStateRequest(this);
            break;
        case 'blocks':
            handleBlocks(this, message);
            break;
        case 'claim':
            handleClaim(this, message);
            break;
        case 'release':
            handleRelease(this, message);
            break;
        case 'host-lock':
            handleHostLock(this, message);
            break;
        case 'lock-request':
            handleLockRequest(this, message);
            break;
        case 'lock-response':
            handleLockResponse(this, message);
            break;
        case 'chat':
            handleChat(this, message);
            break;
        case 'todo':
            handleTodo(this, message);
            break;
        case 'leave':
            leaveRoom(this, 'left');
            break;
        default:
            break;
        }
    }
}

const peersOf = room => [...room.clients.values()].map(client => ({
    id: client.id,
    name: client.name,
    username: client.user ? client.user.username : '',
    nickname: client.user ? displayName(client.user) : client.name,
    userId: client.user ? client.user.id : '',
    host: client.id === room.hostId
}));

const claimsOf = room => [...room.claims.entries()].map(([targetId, claim]) => ({
    targetId,
    clientId: claim.clientId,
    userId: claim.userId,
    name: claim.name
}));

const locksMessage = room => ({
    type: 'locks',
    claims: claimsOf(room),
    projectLocked: Boolean(room.projectLocked),
    hostId: room.hostId
});

const clientById = (room, id) => [...room.clients].find(client => client.id === id) || null;

const broadcast = (room, message, exceptId) => {
    const text = JSON.stringify(message);
    for (const client of room.clients.values()) {
        if (client.id !== exceptId) client.sendText(text);
    }
};

const broadcastPeers = room => {
    broadcast(room, {type: 'peers', peers: peersOf(room), hostId: room.hostId});
};

const broadcastLocks = room => {
    broadcast(room, locksMessage(room));
};

const roomFromClient = client => (client.roomId ? rooms.get(client.roomId) : null);

const scheduleRoomCleanup = room => {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => {
        if (room.clients.size === 0) {
            rooms.delete(room.id);
            log('room expired', room.id);
        }
    }, EMPTY_ROOM_TTL_MS);
};

const canEdit = (room, client, targetId) => {
    if (!room || !client) return false;
    const claim = room.claims.get(targetId);
    if (claim && claim.clientId !== client.id) return false;
    if (room.projectLocked) return client.id === room.hostId;
    return true;
};

const lockOwnerMessage = (room, targetId) => {
    const claim = room.claims.get(targetId);
    if (!claim) return '该代码已被房主锁定';
    return `用户：${claim.name} 已锁定该代码`;
};

const authenticateJoin = message => {
    if (AUTH_DISABLED) {
        const name = normalizeName(message.name);
        return {
            id: `dev-${normalizeRoom(message.room)}-${name}`,
            username: `dev_${name}`,
            nickname: name
        };
    }
    const found = store.getSession(message.token) || store.getCollabSession(message.token, message.room);
    if (!found) return null;
    if (!found.user.verified) return null;
    return found.user;
};

const rejectJoin = (client, message, code) => {
    client.failedJoins += 1;
    if (client.ip && !rateLimit(client.ip, 'join-fail', 20, 10 * 60 * 1000)) {
        client.close(1008, 'join attempts');
        return;
    }
    if (client.failedJoins >= MAX_FAILED_JOINS) {
        client.close(1008, 'join attempts');
        return;
    }
    client.sendJSON({type: 'error', code: code || 'join', message});
};

const joinRoom = (client, message) => {
    if (client.roomId) leaveRoom(client, 'switch-room');
    const roomId = normalizeRoom(message.room);
    if (!validRoom(roomId)) {
        rejectJoin(client, '房间码需为 4-12 位字母或数字');
        return;
    }
    const user = authenticateJoin(message);
    if (!user) {
        rejectJoin(client, AUTH_DISABLED ? '无法识别身份' : 'PointerE 账号登录已失效，请重新登录', 'auth');
        return;
    }
    const roomSecret = normalizeRoomSecret(message.password);
    let room = rooms.get(roomId);
    if (!room) {
        if (rooms.size >= MAX_ROOMS) {
            rejectJoin(client, '服务器房间数量已达上限，请稍后再试');
            return;
        }
        room = {
            id: roomId,
            clients: new Set(),
            hostId: null,
            ownerUserId: user.id,
            secretHash: roomSecret ? hashRoomSecret(roomSecret) : null,
            state: null,
            blocks: new Map(),
            claims: new Map(),
            projectLocked: false,
            todos: [],
            lastActive: Date.now()
        };
        rooms.set(roomId, room);
        log('room created', roomId, 'owner', user.username);
    }
    if (room.secretHash && !roomSecretMatches(room.secretHash, roomSecret)) {
        rejectJoin(client, '房间密码错误', 'password');
        return;
    }
    if (!room.ownerUserId) room.ownerUserId = user.id;
    if (room.clients.size >= MAX_CLIENTS_PER_ROOM) {
        rejectJoin(client, '房间人数已满');
        return;
    }
    if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
    }
    client.user = user;
    client.name = displayName(user);
    client.roomId = roomId;
    client.failedJoins = 0;
    room.clients.add(client);
    room.lastActive = Date.now();
    if (!room.hostId || !clientById(room, room.hostId)) {
        const owner = [...room.clients].find(member => member.user && member.user.id === room.ownerUserId);
        room.hostId = owner ? owner.id : null;
    }
    client.sendJSON({
        type: 'joined',
        id: client.id,
        room: roomId,
        hostId: room.hostId,
        user: store.publicUser(user),
        peers: peersOf(room)
    });
    broadcastPeers(room);
    client.sendJSON(locksMessage(room));
    if (room.state) {
        client.sendJSON({type: 'state', data: room.state, from: 'server', updatedAt: Date.now()});
    } else if (room.clients.size > 1) {
        const host = clientById(room, room.hostId);
        if (host && host.id !== client.id) {
            host.sendJSON({type: 'state-request', from: client.id});
        }
    }
    for (const [targetId, data] of room.blocks) {
        client.sendJSON({type: 'blocks', targetId, data, from: 'server'});
    }
    client.sendJSON({type: 'todo', todos: room.todos || [], from: 'server'});
    log('join', roomId, client.id, user.username, 'clients', room.clients.size);
};

const leaveRoom = (client, reason) => {
    const room = roomFromClient(client);
    if (!room) {
        client.roomId = null;
        return;
    }
    room.clients.delete(client);
    client.roomId = null;
    let released = false;
    for (const [targetId, claim] of room.claims) {
        if (claim.clientId === client.id) {
            room.claims.delete(targetId);
            released = true;
        }
    }
    if (room.clients.size === 0) {
        scheduleRoomCleanup(room);
    } else {
        if (!clientById(room, room.hostId)) {
            const owner = [...room.clients].find(member => member.user && member.user.id === room.ownerUserId);
            if (owner) {
                room.hostId = owner.id;
            } else if (!room.ownerUserId) {
                room.hostId = [...room.clients][0].id;
            } else {
                room.hostId = null;
            }
        }
        broadcastPeers(room);
        if (released) broadcastLocks(room);
    }
    log('leave', room.id, client.id, reason, 'clients', room.clients.size);
};

const handleState = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    if (client.id !== room.hostId) {
        client.sendJSON({type: 'error', message: '只有房主可以同步完整项目'});
        return;
    }
    if (typeof message.data !== 'string' || message.data.length === 0) return;
    if (message.data.length > MAX_MESSAGE_BYTES) {
        client.sendJSON({type: 'error', message: '项目过大，无法同步'});
        return;
    }
    if (!message.data.startsWith('UEsDB')) {
        client.sendJSON({
            type: 'error',
            code: 'guard',
            message: '安全引擎：项目快照不是有效的 sb3 压缩包，已拒绝同步'
        });
        return;
    }
    const now = Date.now();
    client.stateTimes = client.stateTimes.filter(at => now - at < STATE_WINDOW_MS);
    if (client.stateTimes.length >= MAX_STATE_PER_WINDOW) {
        client.sendJSON({
            type: 'error',
            code: 'guard',
            message: '安全引擎：整体同步过于频繁，已暂缓'
        });
        return;
    }
    client.stateTimes.push(now);
    room.state = message.data;
    room.blocks.clear();
    room.lastActive = Date.now();
    broadcast(room, {
        type: 'state',
        data: room.state,
        from: client.id,
        name: client.name,
        updatedAt: Date.now()
    }, client.id);
};

const handleStateRequest = client => {
    const room = roomFromClient(client);
    if (!room) return;
    const host = clientById(room, room.hostId);
    if (host && host.id !== client.id) {
        host.sendJSON({type: 'state-request', from: client.id});
        return;
    }
    const other = [...room.clients].find(member => member.id !== client.id);
    if (other) other.sendJSON({type: 'state-request', from: client.id});
};

const handleBlocks = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    const targetId = String(message.targetId || '').slice(0, 128);
    if (!targetId) return;
    if (!canEdit(room, client, targetId)) {
        client.sendJSON({type: 'error', code: 'locked', message: lockOwnerMessage(room, targetId), targetId});
        const cached = room.blocks.get(targetId);
        if (cached) client.sendJSON({type: 'blocks', targetId, data: cached, from: 'server'});
        return;
    }
    if (typeof message.data !== 'string' || message.data.length === 0) return;
    if (message.data.length > MAX_TARGET_BYTES) {
        client.sendJSON({type: 'error', message: '角色代码过大，无法同步'});
        return;
    }
    const now = Date.now();
    client.blockTimes = client.blockTimes.filter(at => now - at < BLOCK_WINDOW_MS);
    if (client.blockTimes.length >= MAX_BLOCKS_PER_WINDOW) {
        client.sendJSON({
            type: 'error',
            code: 'guard',
            message: '安全引擎：代码同步频率异常，已暂缓'
        });
        return;
    }
    client.blockTimes.push(now);
    const cached = room.blocks.get(targetId);
    const claim = room.claims.get(targetId);
    const ownsTarget = Boolean(claim && claim.clientId === client.id);
    if (cached && !ownsTarget && client.id !== room.hostId &&
        cached.length > 4000 && message.data.length < cached.length * 0.15) {
        client.sendJSON({
            type: 'error',
            code: 'guard',
            message: '安全引擎：检测到大幅清空他人代码，已阻止'
        });
        return;
    }
    room.blocks.set(targetId, message.data);
    room.lastActive = Date.now();
    broadcast(room, {
        type: 'blocks',
        targetId,
        data: message.data,
        from: client.id,
        name: client.name
    }, client.id);
};

const handleClaim = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    const targetId = String(message.targetId || '').slice(0, 128);
    if (!targetId) return;
    if (room.projectLocked && client.id !== room.hostId) {
        client.sendJSON({type: 'error', message: '房主已锁定全部代码'});
        return;
    }
    const existing = room.claims.get(targetId);
    if (existing && existing.clientId !== client.id) {
        client.sendJSON({type: 'error', code: 'locked', message: lockOwnerMessage(room, targetId), targetId});
        return;
    }
    const now = Date.now();
    client.claimTimes = client.claimTimes.filter(at => now - at < CLAIM_WINDOW_MS);
    if (client.claimTimes.length >= MAX_CLAIMS_PER_WINDOW) {
        client.sendJSON({
            type: 'error',
            code: 'guard',
            message: '安全引擎：连续锁定过快，已暂缓'
        });
        return;
    }
    let owned = 0;
    for (const claim of room.claims.values()) {
        if (claim.clientId === client.id) owned += 1;
    }
    if (owned >= MAX_CLAIMS_PER_CLIENT && !existing) {
        client.sendJSON({
            type: 'error',
            code: 'guard',
            message: '安全引擎：单个成员最多同时锁定 20 个角色'
        });
        return;
    }
    client.claimTimes.push(now);
    room.claims.set(targetId, {
        clientId: client.id,
        userId: client.user ? client.user.id : '',
        name: client.name
    });
    broadcastLocks(room);
};

const handleRelease = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    const targetId = String(message.targetId || '').slice(0, 128);
    const claim = room.claims.get(targetId);
    if (!claim) return;
    if (claim.clientId !== client.id && client.id !== room.hostId) {
        client.sendJSON({type: 'error', message: '只有锁定者或房主可以解锁'});
        return;
    }
    room.claims.delete(targetId);
    broadcastLocks(room);
};

const handleHostLock = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    if (client.id !== room.hostId) {
        client.sendJSON({type: 'error', message: '只有房主可以锁定全部代码'});
        return;
    }
    room.projectLocked = Boolean(message.locked);
    broadcastLocks(room);
    broadcast(room, {
        type: 'notice',
        level: 'info',
        message: room.projectLocked ? '房主已锁定全部代码' : '房主已解锁全部代码'
    });
};

const handleLockRequest = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    const targetId = String(message.targetId || '').slice(0, 128);
    const claim = room.claims.get(targetId);
    if (!claim || claim.clientId === client.id) {
        client.sendJSON({type: 'notice', level: 'info', message: '该角色当前没有被其他人锁定'});
        return;
    }
    const now = Date.now();
    client.lockRequestTimes = client.lockRequestTimes.filter(at => now - at < 10000);
    if (client.lockRequestTimes.length >= 8) {
        client.sendJSON({type: 'error', code: 'guard', message: '安全引擎：编辑申请过于频繁，已暂缓'});
        return;
    }
    client.lockRequestTimes.push(now);
    const owner = clientById(room, claim.clientId);
    const payload = {
        type: 'lock-request',
        targetId,
        claim: {...claim, targetId},
        from: {id: client.id, name: client.name, username: client.user ? client.user.username : ''}
    };
    if (owner) owner.sendJSON(payload);
    const host = clientById(room, room.hostId);
    if (host && host.id !== owner?.id) host.sendJSON(payload);
    client.sendJSON({type: 'notice', level: 'info', message: `已向 ${claim.name} 发送编辑申请`});
};

const handleLockResponse = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    const targetId = String(message.targetId || '').slice(0, 128);
    const claim = room.claims.get(targetId);
    if (!claim) return;
    if (claim.clientId !== client.id && client.id !== room.hostId) {
        client.sendJSON({type: 'error', message: '你没有权限处理该申请'});
        return;
    }
    const requester = clientById(room, String(message.to || ''));
    if (!requester) {
        client.sendJSON({type: 'error', message: '申请人已离开房间'});
        return;
    }
    if (message.granted) {
        room.claims.set(targetId, {
            clientId: requester.id,
            userId: requester.user ? requester.user.id : '',
            name: requester.name
        });
        requester.sendJSON({
            type: 'lock-response',
            granted: true,
            targetId,
            by: client.name,
            message: `${client.name} 已同意你的编辑申请`
        });
        broadcastLocks(room);
        broadcast(room, {
            type: 'notice',
            level: 'info',
            message: `${client.name} 把「${targetId}」的编辑权交给了 ${requester.name}`
        }, requester.id);
    } else {
        requester.sendJSON({
            type: 'lock-response',
            granted: false,
            targetId,
            by: client.name,
            message: `${client.name} 拒绝了你的编辑申请`
        });
    }
};

const handleChat = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    const text = String(message.text || '').slice(0, 500);
    if (!text) return;
    broadcast(room, {type: 'chat', from: client.id, name: client.name, text}, null);
};

const normalizeTodos = value => {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 50).map((item, index) => {
        const text = String(item && item.text || '').trim().slice(0, 160);
        if (!text) return null;
        return {
            id: String(item.id || `todo_${index}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `todo_${index}`,
            text,
            done: Boolean(item.done),
            author: String(item.author || '').trim().slice(0, 24),
            createdAt: Number(item.createdAt) || Date.now()
        };
    }).filter(Boolean);
};

const handleTodo = (client, message) => {
    const room = roomFromClient(client);
    if (!room) return;
    room.todos = normalizeTodos(message.todos);
    room.lastActive = Date.now();
    broadcast(room, {
        type: 'todo',
        todos: room.todos,
        from: client.id,
        name: client.name,
        updatedAt: Date.now()
    }, null);
};

const getRoomsInfo = () => [...rooms.values()].map(room => ({
    id: room.id,
    clients: room.clients.size,
    host: (clientById(room, room.hostId) || {}).name || '',
    projectLocked: Boolean(room.projectLocked),
    claims: room.claims.size,
    lastActive: room.lastActive,
    members: [...room.clients.values()].map(client => client.name)
}));

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const address = clientIp(req);

    applySecurityHeaders(req, res);
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        if (origin && !originAllowed(origin)) {
            res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'});
            res.end('Forbidden');
            return;
        }
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    if (req.url.length > 4096) {
        sendJson(res, 414, {error: '请求地址过长'});
        return;
    }

    if ((pathname.startsWith('/api/') || pathname === '/health') &&
        !rateLimit(address, 'api-global', MAX_API_REQUESTS_PER_MINUTE, 60 * 1000)) {
        sendJson(res, 429, {error: '请求过于频繁，请稍后再试'});
        return;
    }

    try {
        if (pathname === '/health') {
            if (!rateLimit(address, 'health', 60, 60 * 1000)) {
                sendJson(res, 429, {error: '请求过于频繁，请稍后再试'});
                return;
            }
            sendJson(res, 200, {
                ok: true,
                name: 'PointerE cloud',
                uptime: Math.floor((Date.now() - startedAt) / 1000)
            });
            return;
        }

        if (pathname === '/robots.txt') {
            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'public, max-age=86400',
                'X-Robots-Tag': 'noindex, nofollow'
            });
            res.end('User-agent: *' + String.fromCharCode(10) + 'Disallow: /' + String.fromCharCode(10));
            return;
        }

        if (pathname === '/api/captcha' && req.method === 'GET') {
            handleCaptcha(req, res);
            return;
        }
        if (pathname === '/api/register' && req.method === 'POST') {
            await handleRegister(req, res);
            return;
        }
        if (pathname === '/api/login' && req.method === 'POST') {
            await handleLogin(req, res);
            return;
        }
        if (pathname === '/api/resend-verification' && req.method === 'POST') {
            await handleResend(req, res);
            return;
        }
        if (pathname === '/api/me' && req.method === 'GET') {
            const found = requireUser(req, res);
            if (found) sendJson(res, 200, {user: store.publicUser(found.user)});
            return;
        }
        if (pathname === '/api/logout' && req.method === 'POST') {
            const token = bearerToken(req);
            if (token) store.destroySession(token);
            sendJson(res, 200, {ok: true});
            return;
        }

        if (pathname === '/api/collab-token' && req.method === 'POST') {
            const found = requireUser(req, res);
            if (!found) return;
            let body;
            try {
                body = await readBody(req);
            } catch (error) {
                sendJson(res, error.status || 400, {error: error.message});
                return;
            }
            const room = normalizeRoom(body.room);
            if (!validRoom(room)) {
                sendJson(res, 400, {error: '房间码无效'});
                return;
            }
            const issued = store.createCollabToken(found.user.id, room);
            sendJson(res, 200, {token: issued.token, room, expiresAt: issued.expiresAt});
            return;
        }

        if (pathname === '/api/notices' && req.method === 'GET') {
            handlePublicNotices(req, res);
            return;
        }
        if (pathname === '/api/extensions/community' && req.method === 'GET') {
            await handleCommunityExtensions(req, res);
            return;
        }
        if (pathname === '/api/extensions/submit' && req.method === 'POST') {
            await handleExtensionSubmit(req, res);
            return;
        }
        if (pathname === '/api/points' && req.method === 'GET') {
            handleGetPoints(req, res);
            return;
        }
        if (pathname === '/api/points/code-activity' && req.method === 'POST') {
            await handleCodeActivity(req, res);
            return;
        }
        if (pathname === '/api/points/address' && req.method === 'POST') {
            await handleSaveAddress(req, res);
            return;
        }
        if (pathname === '/api/points/redeem' && req.method === 'POST') {
            await handleRedeem(req, res);
            return;
        }

        if (pathname === '/api/52dj99/login' && req.method === 'POST') {
            await handleAdminLogin(req, res);
            return;
        }
        if (pathname === '/api/52dj99/me' && req.method === 'GET') {
            const found = requireAdmin(req, res);
            if (found) sendJson(res, 200, {user: store.publicUser(found.user)});
            return;
        }
        if (pathname === '/api/52dj99/users' && req.method === 'GET') {
            handleAdminUsers(req, res, url);
            return;
        }
        const pointsMatch = pathname.match(/^\/api\/52dj99\/users\/([a-f0-9]+)\/points$/);
        if (pointsMatch && req.method === 'POST') {
            await handleAdminUserPoints(req, res, pointsMatch[1]);
            return;
        }
        const actionMatch = pathname.match(/^\/api\/52dj99\/users\/([a-f0-9]+)\/action$/);
        if (actionMatch && req.method === 'POST') {
            await handleAdminUserAction(req, res, actionMatch[1]);
            return;
        }
        if (pathname === '/api/52dj99/smtp' && (req.method === 'GET' || req.method === 'POST')) {
            await handleAdminSmtp(req, res, req.method === 'POST');
            return;
        }
        if (pathname === '/api/52dj99/rooms' && req.method === 'GET') {
            handleAdminRooms(req, res);
            return;
        }
        if (pathname === '/api/52dj99/products' && req.method === 'GET') {
            handleAdminProducts(req, res);
            return;
        }
        if (pathname === '/api/52dj99/products' && req.method === 'POST') {
            await handleAdminProductCreate(req, res);
            return;
        }
        const productDeleteMatch = pathname.match(/^\/api\/52dj99\/products\/([A-Za-z0-9_-]+)\/delete$/);
        if (productDeleteMatch && req.method === 'POST') {
            handleAdminProductDelete(req, res, productDeleteMatch[1]);
            return;
        }
        const productMatch = pathname.match(/^\/api\/52dj99\/products\/([A-Za-z0-9_-]+)$/);
        if (productMatch && req.method === 'POST') {
            await handleAdminProductUpdate(req, res, productMatch[1]);
            return;
        }
        if (pathname === '/api/52dj99/notices' && req.method === 'GET') {
            handleAdminNotices(req, res);
            return;
        }
        if (pathname === '/api/52dj99/notices' && req.method === 'POST') {
            await handleAdminNoticeCreate(req, res);
            return;
        }
        const noticeDeleteMatch = pathname.match(/^\/api\/52dj99\/notices\/([A-Za-z0-9_]+)\/delete$/);
        if (noticeDeleteMatch && req.method === 'POST') {
            handleAdminNoticeDelete(req, res, noticeDeleteMatch[1]);
            return;
        }
        const noticeMatch = pathname.match(/^\/api\/52dj99\/notices\/([A-Za-z0-9_]+)$/);
        if (noticeMatch && req.method === 'POST') {
            await handleAdminNoticeUpdate(req, res, noticeMatch[1]);
            return;
        }
        if (pathname === '/api/52dj99/release' && req.method === 'POST') {
            await handleAdminRelease(req, res);
            return;
        }
        if (pathname === '/api/52dj99/extensions' && req.method === 'GET') {
            handleAdminExtensions(req, res);
            return;
        }
        const extensionSourceMatch = pathname.match(/^\/api\/52dj99\/extensions\/([A-Za-z0-9_]+)\/source$/);
        if (extensionSourceMatch && req.method === 'GET') {
            handleAdminExtensionSource(req, res, extensionSourceMatch[1]);
            return;
        }
        const extensionApproveMatch = pathname.match(/^\/api\/52dj99\/extensions\/([A-Za-z0-9_]+)\/approve$/);
        if (extensionApproveMatch && req.method === 'POST') {
            await handleAdminExtensionApprove(req, res, extensionApproveMatch[1]);
            return;
        }
        const extensionRejectMatch = pathname.match(/^\/api\/52dj99\/extensions\/([A-Za-z0-9_]+)\/reject$/);
        if (extensionRejectMatch && req.method === 'POST') {
            await handleAdminExtensionReject(req, res, extensionRejectMatch[1]);
            return;
        }
        const extensionDeleteMatch = pathname.match(/^\/api\/52dj99\/extensions\/([A-Za-z0-9_]+)\/delete$/);
        if (extensionDeleteMatch && req.method === 'POST') {
            handleAdminExtensionDelete(req, res, extensionDeleteMatch[1]);
            return;
        }
        const communityDeleteMatch = pathname.match(/^\/api\/52dj99\/community-extensions\/([A-Za-z0-9_]+)\/delete$/);
        if (communityDeleteMatch && req.method === 'POST') {
            handleAdminCommunityDelete(req, res, communityDeleteMatch[1]);
            return;
        }
        if (pathname === '/api/52dj99/orders' && req.method === 'GET') {
            handleAdminOrders(req, res);
            return;
        }
        const orderMatch = pathname.match(/^\/api\/52dj99\/orders\/([a-f0-9]+)\/status$/);
        if (orderMatch && req.method === 'POST') {
            await handleAdminOrderStatus(req, res, orderMatch[1]);
            return;
        }

        if (pathname === '/verify' && req.method === 'GET') {
            handleVerify(req, res, url);
            return;
        }

        if (pathname === '/' || pathname === '/index.html') {
            serveStatic(res, 'index.html');
            return;
        }
        if (pathname === '/register' || pathname === '/register/') {
            serveStatic(res, 'register.html');
            return;
        }
        if (pathname === '/extensions') {
            res.writeHead(301, {Location: '/extensions/'});
            res.end();
            return;
        }
        if (pathname === '/extensions/') {
            serveStatic(res, 'extensions/index.html');
            return;
        }
        if (/^\/extensions\/[A-Za-z0-9._/-]+$/.test(pathname)) {
            serveStatic(res, pathname.slice(1));
            return;
        }
        if (/^\/community-extensions\/[A-Za-z0-9_-]+\.js$/.test(pathname)) {
            const filePath = path.join(COMMUNITY_EXTENSION_DIR, path.basename(pathname));
            fs.stat(filePath, (error, stats) => {
                if (error || !stats.isFile()) {
                    sendJson(res, 404, {error: 'Not found'});
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': 'text/javascript; charset=utf-8',
                    'Content-Length': stats.size,
                    'Cache-Control': 'public, max-age=300',
                    'Access-Control-Allow-Origin': '*',
                    'X-Content-Type-Options': 'nosniff'
                });
                fs.createReadStream(filePath).pipe(res);
            });
            return;
        }
        if (/^\/community-extensions\/[A-Za-z0-9_-]+-icon\.(?:png|jpg|webp)$/.test(pathname)) {
            const filePath = path.join(COMMUNITY_EXTENSION_DIR, path.basename(pathname));
            fs.stat(filePath, (error, stats) => {
                if (error || !stats.isFile()) {
                    sendJson(res, 404, {error: 'Not found'});
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                res.writeHead(200, {
                    'Content-Type': ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg'),
                    'Content-Length': stats.size,
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                    'X-Content-Type-Options': 'nosniff'
                });
                fs.createReadStream(filePath).pipe(res);
            });
            return;
        }
        if (/^\/ctspace-extensions\/[A-Za-z0-9]+\.js$/.test(pathname)) {
            const forumId = path.basename(pathname, '.js');
            const item = (await loadCtspaceExtensions()).find(entry => entry.forumId === forumId);
            if (!item) {
                sendJson(res, 404, {error: 'Not found'});
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/javascript; charset=utf-8',
                'Content-Length': Buffer.byteLength(item.code, 'utf8'),
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*',
                'X-Content-Type-Options': 'nosniff'
            });
            res.end(item.code);
            return;
        }
        if (pathname === '/52dj99' || pathname === '/52dj99/') {
            serveStatic(res, 'admin.html');
            return;
        }
        if (pathname === '/52dj99/app.js') {
            serveStatic(res, 'admin.js');
            return;
        }
        const fileDownloadMatch = pathname.match(/^\/downloads\/([A-Za-z0-9._-]+\.(?:exe|zip|apk|dmg))$/);
        if (fileDownloadMatch && (req.method === 'GET' || req.method === 'HEAD')) {
            const fileName = fileDownloadMatch[1];
            const filePath = path.join(PUBLIC_DIR, 'downloads', fileName);
            fs.stat(filePath, (error, stats) => {
                if (error || !stats.isFile()) {
                    sendJson(res, 404, {error: 'Not found'});
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': fileName.toLowerCase().endsWith('.apk') ?
                        'application/vnd.android.package-archive' :
                        'application/octet-stream',
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                    'Content-Length': stats.size,
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                    'X-Robots-Tag': 'noindex, nofollow',
                    'X-Content-Type-Options': 'nosniff'
                });
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                fs.createReadStream(filePath).pipe(res);
            });
            return;
        }
        if (/^\/(app\.css|register\.css|register\.js|favicon\.ico)$/.test(pathname)) {
            serveStatic(res, pathname.slice(1));
            return;
        }
        if (/^\/fonts\/[A-Za-z0-9._-]+\.(?:woff2|woff|ttf)$/.test(pathname)) {
            serveStatic(res, pathname.slice(1));
            return;
        }

        sendJson(res, 404, {error: 'Not found'});
    } catch (error) {
        log('http error', error && error.stack ? error.stack : error);
        if (!res.headersSent) sendJson(res, 500, {error: '服务器内部错误'});
    }
});

server.headersTimeout = 15000;
server.requestTimeout = 20000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;
server.on('clientError', (error, socket) => {
    socket.destroy();
});

server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const origin = req.headers.origin;
    if (!key || !origin || !originAllowed(origin)) {
        try {
            socket.write(['HTTP/1.1 403 Forbidden', 'Connection: close', 'Content-Length: 0', '', ''].join(String.fromCharCode(13, 10)));
        } catch (error) {
            // ignored
        }
        socket.destroy();
        return;
    }
    if (totalClients() >= MAX_TOTAL_CLIENTS ||
        !rateLimit(clientIp(req), 'ws-upgrade', MAX_WS_UPGRADES_PER_MINUTE, 60 * 1000)) {
        try {
            socket.write(['HTTP/1.1 429 Too Many Requests', 'Connection: close', 'Content-Length: 0', '', ''].join(String.fromCharCode(13, 10)));
        } catch (error) {
            // ignored
        }
        socket.destroy();
        return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true);
    const client = new Client(socket);
    client.ip = clientIp(req);
    socket.on('data', chunk => client.onData(chunk));
    socket.on('end', () => {
        log('ws end', client.id);
        client.terminate('socket-end');
    });
    socket.on('close', () => {
        log('ws close', client.id);
        client.terminate('socket-close');
    });
    socket.on('error', error => {
        log('ws error', client.id, error && error.code);
        client.terminate('socket-error');
    });
    client.sendJSON({type: 'welcome', id: client.id});
});

setInterval(() => {
    for (const room of rooms.values()) {
        for (const client of room.clients.values()) {
            if (!client.alive) {
                client.terminate('heartbeat');
                continue;
            }
            client.alive = false;
            client.ping();
        }
    }
}, HEARTBEAT_MS).unref();

const shutdown = signal => {
    log('shutting down', signal);
    for (const room of rooms.values()) {
        for (const client of room.clients.values()) client.close(1001, 'server shutdown');
        if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, HOST, () => {
    log(`PointerE cloud listening on ${HOST}:${PORT} (public: ${PUBLIC_BASE}, auth ${AUTH_DISABLED ? 'OFF' : 'ON'})`);
});
