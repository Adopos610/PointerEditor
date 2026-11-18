'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.POINTER_DATA_DIR
    ? path.resolve(process.env.POINTER_DATA_DIR)
    : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = process.env.POINTER_CONFIG_FILE
    ? path.resolve(process.env.POINTER_CONFIG_FILE)
    : path.join(DATA_DIR, 'config.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin-credentials.txt');

fs.mkdirSync(DATA_DIR, {recursive: true});

const now = () => Date.now();
const randomId = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const POINTS = {
    REGISTER: 100,
    DAILY_CODE: 10
};

const DEFAULT_PRODUCTS = [
    {
        id: 'sticker-pack',
        name: 'PointerEditor 蓝白贴纸包',
        description: '一套 6 张蓝白主题贴纸，贴在本子或电脑上。',
        points: 300,
        icon: '✦',
        stock: 120,
        enabled: true
    },
    {
        id: 'pointer-badge',
        name: '指针迭代金属徽章',
        description: '指针迭代图标金属徽章，附背卡。',
        points: 800,
        icon: '◎',
        stock: 60,
        enabled: true
    },
    {
        id: 'pointer-mug',
        name: '蓝白指针马克杯',
        description: 'PointerEditor 蓝白配色陶瓷马克杯，容量 350ml。',
        points: 1500,
        icon: '◒',
        stock: 40,
        enabled: true
    },
    {
        id: 'pointer-keyboard',
        name: 'PointerEditor 机械键盘',
        description: '蓝白主题机械键盘，87 键，适合写代码和写作品。',
        points: 5000,
        icon: '⌨',
        stock: 8,
        enabled: true
    }
];

const chinaDateKey = () => {
    const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
};

const normalizeAddress = address => {
    if (!address || typeof address !== 'object') return null;
    const name = String(address.name || '').trim().slice(0, 40);
    const phone = String(address.phone || '').trim().slice(0, 30);
    const detail = String(address.detail || '').trim().slice(0, 300);
    if (!name || !phone || !detail) return null;
    return {name, phone, detail};
};

const ensureUserPoints = user => {
    if (typeof user.points !== 'number' || !Number.isFinite(user.points)) user.points = 0;
    if (!Array.isArray(user.pointsHistory)) user.pointsHistory = [];
    if (typeof user.dailyCodeDate !== 'string') user.dailyCodeDate = '';
    if (typeof user.registrationPointsAwarded !== 'boolean') user.registrationPointsAwarded = false;
    if (!Object.prototype.hasOwnProperty.call(user, 'shippingAddress')) user.shippingAddress = null;
};

const addPointsInternal = (user, delta, reason, meta = {}) => {
    if (!user || !Number.isFinite(delta) || delta === 0) return null;
    ensureUserPoints(user);
    const before = user.points;
    user.points = Math.max(0, before + delta);
    const applied = user.points - before;
    if (applied === 0) return null;
    const entry = {
        id: randomId(6),
        delta: applied,
        reason,
        meta,
        at: now()
    };
    user.pointsHistory.unshift(entry);
    if (user.pointsHistory.length > 200) user.pointsHistory.length = 200;
    return entry;
};

const readJSON = (file, fallback) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return fallback;
    }
};

const writeJSON = (file, value, mode) => {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, mode ? {mode} : undefined);
    fs.renameSync(tmp, file);
};

let config = readJSON(CONFIG_FILE, null);
if (!config) {
    config = {
        smtp: {
            host: process.env.POINTER_SMTP_HOST || 'smtp.qq.com',
            port: Number(process.env.POINTER_SMTP_PORT || 465),
            secure: String(process.env.POINTER_SMTP_SECURE || 'true') !== 'false',
            user: process.env.POINTER_SMTP_USER || '',
            pass: process.env.POINTER_SMTP_PASS || '',
            fromName: process.env.POINTER_SMTP_FROM_NAME || 'PointerE'
        },
        captchaSecret: process.env.POINTER_CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex'),
        publicBaseUrl: process.env.POINTER_PUBLIC_URL || 'https://vable.ctspace.xyz'
    };
    writeJSON(CONFIG_FILE, config, 0o600);
}

if (!config.captchaSecret) {
    config.captchaSecret = crypto.randomBytes(32).toString('hex');
    writeJSON(CONFIG_FILE, config, 0o600);
}

if (!config.collabSecret) {
    config.collabSecret = crypto.randomBytes(32).toString('hex');
    writeJSON(CONFIG_FILE, config, 0o600);
}

const saveConfig = next => {
    config = {...config, ...next};
    writeJSON(CONFIG_FILE, config, 0o600);
    return config;
};

const getConfig = () => config;

const hashPassword = (password, salt) => {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, useSalt, 64, {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
    return {salt: useSalt, hash: hash.toString('hex')};
};

const verifyPassword = (password, salt, hash) => {
    try {
        const next = crypto.scryptSync(password, salt, 64, {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
        const expected = Buffer.from(hash, 'hex');
        return next.length === expected.length && crypto.timingSafeEqual(next, expected);
    } catch (error) {
        return false;
    }
};

let db = readJSON(DB_FILE, null);
if (!db || !Array.isArray(db.users)) {
    db = {version: 2, users: [], sessions: [], products: [], orders: []};
}
if (!Array.isArray(db.sessions)) db.sessions = [];
if (!Array.isArray(db.products)) db.products = [];
if (!Array.isArray(db.orders)) db.orders = [];
if (!Array.isArray(db.announcements)) db.announcements = [];
if (!db.release || typeof db.release !== 'object') {
    db.release = {
        version: '0.2.2',
        downloadUrl: 'https://peditor.ctspace.xyz/',
        notesUrl: 'https://github.com/PointerItera/PointerEditor/releases'
    };
}
db.users.forEach(ensureUserPoints);
let seededProducts = false;
if (!db.productsSeeded) {
    DEFAULT_PRODUCTS.forEach(product => {
        if (!db.products.some(item => item.id === product.id)) {
            db.products.push({...product});
        }
    });
    db.productsSeeded = true;
    seededProducts = true;
}

let migratedPoints = false;
db.users.forEach(user => {
    ensureUserPoints(user);
    if (user.role === 'user' && user.verified && !user.registrationPointsAwarded) {
        user.registrationPointsAwarded = true;
        addPointsInternal(user, POINTS.REGISTER, '注册奖励', {source: 'migration'});
        migratedPoints = true;
    }
});

const persist = () => writeJSON(DB_FILE, db, 0o600);
if (migratedPoints || seededProducts) persist();

const seedAdmin = () => {
    const hasAdmin = db.users.some(user => user.role === 'admin');
    if (hasAdmin) return;
    const username = (process.env.POINTER_ADMIN_USER || 'pointeradmin').trim();
    let password = process.env.POINTER_ADMIN_PASSWORD || '';
    if (!password) {
        password = crypto.randomBytes(12).toString('base64url');
    }
    const {salt, hash} = hashPassword(password);
    db.users.push({
        id: randomId(),
        username,
        email: process.env.POINTER_ADMIN_EMAIL || '',
        nickname: '管理员',
        role: 'admin',
        verified: true,
        disabled: false,
        salt,
        passwordHash: hash,
        createdAt: now(),
        verifiedAt: now(),
        lastLoginAt: 0
    });
    persist();
    fs.writeFileSync(
        ADMIN_FILE,
        `PointerE 控制台\n地址：${config.publicBaseUrl}/pointere-console\n账号：${username}\n密码：${password}\n生成时间：${new Date().toISOString()}\n`,
        {mode: 0o600}
    );
    console.log(`[account] seeded admin "${username}" - credentials written to ${ADMIN_FILE}`);
};

seedAdmin();

const publicUser = user => ({
    id: user.id,
    username: user.username,
    nickname: user.nickname || user.username,
    email: user.email,
    role: user.role,
    verified: Boolean(user.verified),
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt,
    verifiedAt: user.verifiedAt || 0,
    lastLoginAt: user.lastLoginAt || 0,
    points: Number(user.points) || 0
});

const findById = id => db.users.find(user => user.id === id) || null;
const findByUsername = username => {
    const target = String(username || '').trim().toLowerCase();
    return db.users.find(user => user.username.toLowerCase() === target) || null;
};
const findByEmail = email => {
    const target = String(email || '').trim().toLowerCase();
    return db.users.find(user => (user.email || '').toLowerCase() === target) || null;
};

const createUser = ({username, email, password, verified = false}) => {
    const {salt, hash} = hashPassword(password);
    const user = {
        id: randomId(),
        username,
        email,
        nickname: username,
        role: 'user',
        verified,
        disabled: false,
        salt,
        passwordHash: hash,
        createdAt: now(),
        verifiedAt: verified ? now() : 0,
        lastLoginAt: 0,
        points: 0,
        pointsHistory: [],
        dailyCodeDate: '',
        shippingAddress: null,
        registrationPointsAwarded: false
    };
    db.users.push(user);
    persist();
    return user;
};

const updateUser = (id, patch) => {
    const user = findById(id);
    if (!user) return null;
    Object.assign(user, patch);
    persist();
    return user;
};

const setPassword = (id, password) => {
    const user = findById(id);
    if (!user) return null;
    const {salt, hash} = hashPassword(password);
    user.salt = salt;
    user.passwordHash = hash;
    persist();
    return user;
};

const deleteUser = id => {
    const index = db.users.findIndex(user => user.id === id);
    if (index < 0) return false;
    db.users.splice(index, 1);
    db.sessions = db.sessions.filter(session => session.userId !== id);
    persist();
    return true;
};

const listUsers = () => db.users.map(publicUser);

const createSession = (userId, kind = 'user') => {
    const token = randomToken();
    const ttl = kind === 'admin' ? 12 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    db.sessions.push({
        tokenHash: sha256(token),
        userId,
        kind,
        createdAt: now(),
        expiresAt: now() + ttl
    });
    purgeSessions();
    persist();
    return token;
};

const getSession = token => {
    if (!token) return null;
    const tokenHash = sha256(token);
    const session = db.sessions.find(item => item.tokenHash === tokenHash);
    if (!session) return null;
    if (session.expiresAt <= now()) {
        db.sessions = db.sessions.filter(item => item !== session);
        persist();
        return null;
    }
    const user = findById(session.userId);
    if (!user || user.disabled) return null;
    return {session, user};
};

const destroySession = token => {
    if (!token) return false;
    const tokenHash = sha256(token);
    const before = db.sessions.length;
    db.sessions = db.sessions.filter(item => item.tokenHash !== tokenHash);
    if (db.sessions.length !== before) {
        persist();
        return true;
    }
    return false;
};

const COLLAB_TOKEN_TTL = 2 * 60 * 60 * 1000;

const collabSignature = payload => crypto
    .createHmac('sha256', config.collabSecret)
    .update(payload)
    .digest('base64url');

const createCollabToken = (userId, room) => {
    const payload = Buffer.from(JSON.stringify({
        u: userId,
        r: String(room || '').trim().toUpperCase(),
        e: now() + COLLAB_TOKEN_TTL
    }), 'utf8').toString('base64url');
    return {
        token: `${payload}.${collabSignature(payload)}`,
        expiresAt: now() + COLLAB_TOKEN_TTL
    };
};

const getCollabSession = (token, room) => {
    const text = String(token || '');
    const dot = text.lastIndexOf('.');
    if (dot <= 0 || dot === text.length - 1) return null;
    const payload = text.slice(0, dot);
    const signature = text.slice(dot + 1);
    const expected = collabSignature(payload);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch (error) {
        return null;
    }
    if (!data || typeof data.u !== 'string' || typeof data.e !== 'number' || data.e <= now()) return null;
    if (room && data.r && data.r !== String(room).trim().toUpperCase()) return null;
    const user = findById(data.u);
    if (!user || user.disabled || !user.verified) return null;
    return {session: {kind: 'collab', userId: user.id, room: data.r || ''}, user};
};

const purgeSessions = () => {
    const cutoff = now();
    const before = db.sessions.length;
    db.sessions = db.sessions.filter(session => session.expiresAt > cutoff);
    if (db.sessions.length !== before) return true;
    return false;
};

const createVerifyToken = userId => {
    const token = randomToken();
    updateUser(userId, {
        verifyTokenHash: sha256(token),
        verifyTokenExpires: now() + 24 * 60 * 60 * 1000
    });
    return token;
};

const findUserByVerifyToken = token => {
    if (!token) return null;
    const tokenHash = sha256(token);
    return db.users.find(user => user.verifyTokenHash === tokenHash) || null;
};

const stats = () => {
    purgeSessions();
    const weekAgo = now() - 7 * 24 * 60 * 60 * 1000;
    return {
        users: db.users.filter(user => user.role !== 'admin').length,
        verified: db.users.filter(user => user.role !== 'admin' && user.verified).length,
        disabled: db.users.filter(user => user.role !== 'admin' && user.disabled).length,
        admins: db.users.filter(user => user.role === 'admin').length,
        newUsers: db.users.filter(user => user.role !== 'admin' && user.createdAt >= weekAgo).length,
        sessions: db.sessions.filter(session => session.expiresAt > now()).length
    };
};

const markVerified = userId => {
    const user = findById(userId);
    if (!user) return null;
    user.verified = true;
    user.verifiedAt = user.verifiedAt || now();
    user.verifyTokenHash = null;
    user.verifyTokenExpires = 0;
    ensureUserPoints(user);
    if (user.role === 'user' && !user.registrationPointsAwarded) {
        user.registrationPointsAwarded = true;
        addPointsInternal(user, POINTS.REGISTER, '注册奖励', {source: 'verify'});
    }
    persist();
    return user;
};

const awardPoints = (userId, delta, reason, meta = {}) => {
    const user = findById(userId);
    if (!user) return null;
    addPointsInternal(user, delta, reason, meta);
    persist();
    return user;
};

const claimDailyCodePoints = userId => {
    const user = findById(userId);
    if (!user) return {error: '用户不存在'};
    ensureUserPoints(user);
    const today = chinaDateKey();
    if (user.dailyCodeDate === today) {
        return {
            awarded: false,
            amount: 0,
            points: user.points,
            date: today
        };
    }
    user.dailyCodeDate = today;
    addPointsInternal(user, POINTS.DAILY_CODE, '每日代码奖励', {source: 'editor'});
    persist();
    return {
        awarded: true,
        amount: POINTS.DAILY_CODE,
        points: user.points,
        date: today
    };
};

const getProducts = () => db.products.filter(product => product.enabled !== false);
const listAllProducts = () => db.products.map(product => ({...product}));
const findProduct = id => db.products.find(product => product.id === id) || null;

const normalizeProduct = (input = {}, existing = {}) => {
    const name = String(input.name !== undefined ? input.name : existing.name || '').trim().slice(0, 80);
    const description = String(
        input.description !== undefined ? input.description : existing.description || ''
    ).trim().slice(0, 500);
    const icon = (String(input.icon !== undefined ? input.icon : existing.icon || '✦').trim() || '✦').slice(0, 8);
    const points = Number(input.points !== undefined ? input.points : existing.points);
    const stock = Number(input.stock !== undefined ? input.stock : existing.stock);
    const enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled !== false;
    if (!name) return {error: '请填写商品名称'};
    if (!Number.isInteger(points) || points < 1 || points > 1000000) {
        return {error: '所需积分必须是 1–1000000 的整数'};
    }
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
        return {error: '库存必须是 0–1000000 的整数'};
    }
    return {value: {...existing, name, description, icon, points, stock, enabled}};
};

const createProduct = input => {
    const normalized = normalizeProduct(input, {});
    if (normalized.error) return normalized;
    const product = {
        id: `product_${randomId(6)}`,
        ...normalized.value,
        createdAt: now()
    };
    db.products.unshift(product);
    persist();
    return {product};
};

const updateProduct = (id, input) => {
    const product = findProduct(id);
    if (!product) return {error: '商品不存在'};
    const normalized = normalizeProduct(input, product);
    if (normalized.error) return normalized;
    Object.assign(product, normalized.value);
    persist();
    return {product};
};

const deleteProduct = id => {
    const index = db.products.findIndex(product => product.id === id);
    if (index < 0) return false;
    db.products.splice(index, 1);
    persist();
    return true;
};

const saveShippingAddress = (userId, address) => {
    const user = findById(userId);
    if (!user) return {error: '用户不存在'};
    const normalized = normalizeAddress(address);
    if (!normalized) return {error: '请填写完整的收货信息'};
    user.shippingAddress = normalized;
    persist();
    return {address: normalized};
};

const getUserOrders = userId => db.orders
    .filter(order => order.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);

const redeemProduct = (userId, productId, address) => {
    const user = findById(userId);
    if (!user) return {error: '用户不存在'};
    ensureUserPoints(user);
    const product = findProduct(productId);
    if (!product || product.enabled === false) return {error: '商品不存在或已下架'};
    if (product.stock <= 0) return {error: '该商品已兑完'};
    if (user.points < product.points) return {error: '积分不足'};
    const normalized = normalizeAddress(address || user.shippingAddress);
    if (!normalized) return {error: '请填写收货人、手机号和详细地址'};
    user.shippingAddress = normalized;
    product.stock -= 1;
    const order = {
        id: randomId(8),
        userId: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        productId: product.id,
        productName: product.name,
        productIcon: product.icon,
        points: product.points,
        address: normalized,
        status: 'pending',
        createdAt: now(),
        shippedAt: 0
    };
    addPointsInternal(user, -product.points, `兑换：${product.name}`, {orderId: order.id});
    db.orders.unshift(order);
    persist();
    return {order, points: user.points};
};

const listOrders = () => db.orders.slice().sort((a, b) => b.createdAt - a.createdAt);

const updateOrderStatus = (orderId, status) => {
    const allowed = ['pending', 'shipped', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return null;
    const order = db.orders.find(item => item.id === orderId);
    if (!order) return null;
    order.status = status;
    if (status === 'shipped') order.shippedAt = now();
    persist();
    return order;
};

const normalizeNotice = (input = {}, existing = {}) => {
    const title = String(input.title !== undefined ? input.title : existing.title || '').trim().slice(0, 80);
    const body = String(input.body !== undefined ? input.body : existing.body || '').trim().slice(0, 2000);
    const level = ['info', 'update', 'warning'].includes(input.level) ?
        input.level : (existing.level || 'info');
    const active = input.active !== undefined ? Boolean(input.active) : existing.active !== false;
    if (!title) return {error: '请填写公告标题'};
    if (!body) return {error: '请填写公告内容'};
    return {value: {...existing, title, body, level, active}};
};

const listNotices = () => db.announcements.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const listActiveNotices = () => listNotices().filter(notice => notice.active !== false).slice(0, 20);

const createNotice = input => {
    const normalized = normalizeNotice(input, {});
    if (normalized.error) return normalized;
    const notice = {
        id: `notice_${randomId(6)}`,
        ...normalized.value,
        createdAt: now()
    };
    db.announcements.unshift(notice);
    persist();
    return {notice};
};

const updateNotice = (id, input) => {
    const notice = db.announcements.find(item => item.id === id);
    if (!notice) return {error: '公告不存在'};
    const normalized = normalizeNotice(input, notice);
    if (normalized.error) return normalized;
    Object.assign(notice, normalized.value);
    persist();
    return {notice};
};

const deleteNotice = id => {
    const index = db.announcements.findIndex(item => item.id === id);
    if (index < 0) return false;
    db.announcements.splice(index, 1);
    persist();
    return true;
};

const getRelease = () => ({...db.release});

const saveRelease = input => {
    const version = String(input.version || '').trim().slice(0, 40);
    const downloadUrl = String(input.downloadUrl || '').trim().slice(0, 500);
    const notesUrl = String(input.notesUrl || '').trim().slice(0, 500);
    if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) return {error: '版本号格式应为 0.2.2'};
    if (downloadUrl && !/^https?:\/\//i.test(downloadUrl)) return {error: '下载地址必须以 http(s):// 开头'};
    if (notesUrl && !/^https?:\/\//i.test(notesUrl)) return {error: '更新说明地址必须以 http(s):// 开头'};
    db.release = {version, downloadUrl, notesUrl};
    persist();
    return {release: getRelease()};
};

module.exports = {
    DATA_DIR,
    CONFIG_FILE,
    ADMIN_FILE,
    getConfig,
    saveConfig,
    publicUser,
    findById,
    findByUsername,
    findByEmail,
    createUser,
    updateUser,
    setPassword,
    deleteUser,
    listUsers,
    createSession,
    getSession,
    destroySession,
    createCollabToken,
    getCollabSession,
    createVerifyToken,
    findUserByVerifyToken,
    verifyPassword,
    markVerified,
    awardPoints,
    claimDailyCodePoints,
    getProducts,
    listAllProducts,
    findProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    saveShippingAddress,
    getUserOrders,
    redeemProduct,
    listOrders,
    updateOrderStatus,
    listNotices,
    listActiveNotices,
    createNotice,
    updateNotice,
    deleteNotice,
    getRelease,
    saveRelease,
    POINTS,
    chinaDateKey,
    stats
};
