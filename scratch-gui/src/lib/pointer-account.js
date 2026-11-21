const API_BASE = 'https://vable.ctspace.xyz/api';
const TOKEN_KEY = 'pointere.token';
const USER_KEY = 'pointere.user';

export const REGISTER_URL = 'https://vable.ctspace.xyz/register';
export const ACCOUNT_SITE = 'https://vable.ctspace.xyz';

const readStoredUser = () => {
    try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
};

export const getAccount = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const user = readStoredUser();
    return user ? {token, user} : {token, user: null};
};

const emitAccountChanged = () => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('pointere-account-changed'));
    }
};

export const saveAccount = (token, user) => {
    const hadUser = Boolean(localStorage.getItem(USER_KEY));
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    if (!hadUser) localStorage.removeItem('pointer.cloud.token');
    emitAccountChanged();
};

export const updateStoredUser = user => {
    if (!user) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    emitAccountChanged();
};

export const clearAccount = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('pointer.cloud.token');
    emitAccountChanged();
};

const request = (path, {method = 'GET', body, token, timeout = 15000} = {}) => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller ? controller.signal : undefined
    }).then(response => response.json().catch(() => ({})).then(data => {
        if (timer) clearTimeout(timer);
        if (!response.ok) {
            const error = new Error((data && data.error) || `请求失败（${response.status}）`);
            error.status = response.status;
            error.code = data && data.code;
            error.data = data;
            throw error;
        }
        return data;
    })).catch(error => {
        if (timer) clearTimeout(timer);
        if (error.name === 'AbortError') {
            const timeoutError = new Error('连接 PointerE 账号服务超时，请检查网络');
            timeoutError.status = 0;
            throw timeoutError;
        }
        if (!error.status && error instanceof TypeError) {
            const networkError = new Error('无法连接 PointerE 账号服务，请检查网络');
            networkError.status = 0;
            throw networkError;
        }
        throw error;
    });
};

export const fetchCaptcha = () => request('/captcha');

export const registerAccount = ({username, email, password, captchaId, captchaAnswer}) => request('/register', {
    method: 'POST',
    body: {username, email, password, captchaId, captchaAnswer}
});

export const loginAccount = (account, password) => request('/login', {
    method: 'POST',
    body: {account, password}
});

export const fetchMe = token => request('/me', {token});

export const logoutAccount = token => request('/logout', {method: 'POST', token});

export const resendVerification = email => request('/resend-verification', {
    method: 'POST',
    body: {email}
});

export const fetchPointerPoints = token => request('/points', {token});

export const claimDailyCodePoints = token => request('/points/code-activity', {
    method: 'POST',
    token
});

export const saveShippingAddress = (token, address) => request('/points/address', {
    method: 'POST',
    token,
    body: {address}
});

export const redeemMallProduct = (token, productId, address) => request('/points/redeem', {
    method: 'POST',
    token,
    body: {productId, address}
});
