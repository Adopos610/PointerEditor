'use strict';

const TOKEN_KEY = 'pointere.console.token';

const $ = id => document.getElementById(id);
const loginView = $('login-view');
const dashboard = $('dashboard');
const loginForm = $('login-form');
const loginError = $('login-error');
const loginButton = $('login-button');
const whoEl = $('who');
const statsEl = $('stats');
const userRows = $('user-rows');
const userEmpty = $('user-empty');
const usersError = $('users-error');
const roomRows = $('room-rows');
const roomEmpty = $('room-empty');
const orderRows = $('order-rows');
const orderEmpty = $('order-empty');
const orderCount = $('order-count');
const ordersError = $('orders-error');
const userSearch = $('user-search');
const smtpForm = $('smtp-form');
const smtpError = $('smtp-error');
const smtpOk = $('smtp-ok');
const smtpBadge = $('smtp-badge');
const modal = $('modal');
const modalTitle = $('modal-title');
const modalBody = $('modal-body');

let adminUser = null;
let refreshTimer = null;

const el = (tag, options = {}, children = []) => {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.title) node.title = options.title;
    if (options.disabled) node.disabled = true;
    for (const child of children) {
        if (child) node.appendChild(child);
    }
    return node;
};

const button = (text, action, className = 'button-small') => {
    const node = el('button', {className, text, type: 'button'});
    node.addEventListener('click', action);
    return node;
};

const badge = (text, tone) => el('span', {className: `badge ${tone}`, text});

const showMessage = (node, text) => {
    node.textContent = text || '';
    node.hidden = !text;
};

const formatDate = value => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';

const api = async (path, options = {}) => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }
    if (response.status === 401) {
        logout();
        throw new Error((data && data.error) || '登录已失效');
    }
    if (!response.ok) {
        throw new Error((data && data.error) || `请求失败（${response.status}）`);
    }
    return data;
};

const showModal = (title, body) => {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modal.hidden = false;
};

const closeModal = () => {
    modal.hidden = true;
};

$('modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
});

const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    adminUser = null;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    dashboard.hidden = true;
    loginView.hidden = false;
    loginForm.reset();
};

const start = user => {
    adminUser = user;
    loginView.hidden = true;
    dashboard.hidden = false;
    whoEl.textContent = `当前账号：${user.nickname || user.username}（${user.username}）`;
    loadAll();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadAll, 20000);
};

const renderStats = stats => {
    statsEl.textContent = '';
    const cards = [
        ['账号总数', stats.users],
        ['已验证', stats.verified],
        ['已停用', stats.disabled],
        ['近 7 天注册', stats.newUsers],
        ['有效会话', stats.sessions],
        ['在线房间', stats.rooms]
    ];
    for (const [label, value] of cards) {
        statsEl.appendChild(el('div', {className: 'card'}, [
            el('div', {className: 'label', text: label}),
            el('div', {className: 'value', text: String(value !== undefined ? value : 0)})
        ]));
    }
};

const actionLabel = action => ({
    verify: '通过验证',
    disable: '停用',
    enable: '启用',
    delete: '删除',
    resend: '重发验证',
    'reset-password': '重置密码'
}[action] || action);

const runUserAction = async (user, action) => {
    if (action === 'delete' && !window.confirm(`确定删除账号 ${user.username}？该操作不可恢复。`)) return;
    if (action === 'disable' && !window.confirm(`确定停用账号 ${user.username}？`)) return;
    showMessage(usersError, '');
    try {
        const data = await api(`/api/pointere-console/users/${user.id}/action`, {
            method: 'POST',
            body: {action}
        });
        if (data && data.tempPassword) {
            showModal('临时密码', `账号：${user.username}\n临时密码：${data.tempPassword}\n\n请把临时密码发送给用户，并提醒对方尽快修改。`);
        } else if (action === 'resend') {
            showModal('验证邮件', `已为 ${user.username} 重新发送验证邮件。`);
        }
        await loadUsers();
    } catch (error) {
        showMessage(usersError, error.message);
    }
};

const renderUsers = users => {
    userRows.textContent = '';
    userEmpty.hidden = users.length > 0;
    for (const user of users) {
        const status = el('div', {});
        status.appendChild(user.verified ? badge('已验证', 'ok') : badge('未验证', 'warn'));
        if (user.disabled) status.appendChild(badge('已停用', 'off'));
        if (user.role === 'admin') status.appendChild(badge('管理员', 'off'));

        const actions = el('td', {className: 'actions'});
        if (!user.verified) {
            actions.appendChild(button('通过验证', () => runUserAction(user, 'verify')));
            actions.appendChild(button('重发验证', () => runUserAction(user, 'resend')));
        }
        if (user.disabled) {
            actions.appendChild(button('启用', () => runUserAction(user, 'enable')));
        } else {
            actions.appendChild(button('停用', () => runUserAction(user, 'disable')));
        }
        actions.appendChild(button('重置密码', () => runUserAction(user, 'reset-password')));
        actions.appendChild(button('删除', () => runUserAction(user, 'delete'), 'button-small danger'));

        userRows.appendChild(el('tr', {}, [
            el('td', {text: user.username}),
            el('td', {text: user.email || '—'}),
            el('td', {}, [status]),
            el('td', {text: formatDate(user.createdAt)}),
            el('td', {text: formatDate(user.lastLoginAt)}),
            actions
        ]));
    }
};

const loadUsers = async () => {
    const query = userSearch.value.trim();
    const data = await api(`/api/pointere-console/users${query ? `?query=${encodeURIComponent(query)}` : ''}`);
    renderUsers(data.users || []);
    renderStats({...data.stats, rooms: (data.rooms || []).length});
};

const renderRooms = rooms => {
    roomRows.textContent = '';
    roomEmpty.hidden = rooms.length > 0;
    for (const room of rooms) {
        roomRows.appendChild(el('tr', {}, [
            el('td', {text: room.id}),
            el('td', {text: String(room.clients)}),
            el('td', {text: room.host || '—'}),
            el('td', {text: String(room.claims)}),
            el('td', {}, [room.projectLocked ? badge('是', 'warn') : badge('否', 'off')]),
            el('td', {text: (room.members || []).join('、') || '—'})
        ]));
    }
};

const loadRooms = async () => {
    const data = await api('/api/pointere-console/rooms');
    renderRooms(data.rooms || []);
    renderStats({...data.stats, rooms: (data.rooms || []).length});
};


const ORDER_STATUS = {
    pending: {text: '待发货', tone: 'warn'},
    shipped: {text: '已发货', tone: 'ok'},
    completed: {text: '已完成', tone: 'off'},
    cancelled: {text: '已取消', tone: 'off'}
};

const changeOrderStatus = async (order, status) => {
    try {
        await api(`/api/pointere-console/orders/${order.id}/status`, {
            method: 'POST',
            body: {status}
        });
        await loadOrders();
    } catch (error) {
        showMessage(ordersError, error.message);
    }
};

const renderOrders = orders => {
    orderRows.textContent = '';
    orderEmpty.hidden = orders.length > 0;
    orderCount.textContent = `${orders.length} 个订单`;
    orderCount.className = `badge ${orders.some(item => item.status === 'pending') ? 'warn' : 'off'}`;
    for (const order of orders) {
        const address = order.address || {};
        const statusInfo = ORDER_STATUS[order.status] || {text: order.status || '未知', tone: 'off'};
        const actions = [];
        if (order.status === 'pending') {
            actions.push(button('标记已发货', () => changeOrderStatus(order, 'shipped')));
        }
        if (order.status === 'shipped') {
            actions.push(button('标记已完成', () => changeOrderStatus(order, 'completed')));
        }
        orderRows.appendChild(el('tr', {}, [
            el('td', {text: order.id}),
            el('td', {text: `${order.productIcon || ''} ${order.productName || order.productId}`.trim()}),
            el('td', {text: order.nickname ? `${order.nickname}（${order.username}）` : order.username}),
            el('td', {text: String(order.points || 0)}),
            el('td', {text: `${address.name || '—'} / ${address.phone || '—'} / ${address.detail || '—'}`}),
            el('td', {text: formatDate(order.createdAt)}),
            el('td', {}, [badge(statusInfo.text, statusInfo.tone)]),
            el('td', {}, actions)
        ]));
    }
};

const loadOrders = async () => {
    showMessage(ordersError, '');
    const data = await api('/api/pointere-console/orders');
    renderOrders(data.orders || []);
};

const fillSmtp = data => {
    const smtp = data.smtp;
    smtpForm.elements.host.value = smtp.host || '';
    smtpForm.elements.port.value = smtp.port || 465;
    smtpForm.elements.secure.value = smtp.secure ? 'true' : 'false';
    smtpForm.elements.user.value = smtp.user || '';
    smtpForm.elements.fromName.value = smtp.fromName || 'PointerE';
    smtpForm.elements.pass.value = '';
    smtpForm.elements.pass.placeholder = smtp.hasPassword ? '已设置（留空表示不修改）' : '请输入授权码';
    smtpBadge.textContent = data.configured ? '已配置' : '未配置';
    smtpBadge.className = `badge ${data.configured ? 'ok' : 'off'}`;
};

const loadSmtp = async () => {
    try {
        fillSmtp(await api('/api/pointere-console/smtp'));
    } catch (error) {
        showMessage(smtpError, error.message);
    }
};

const loadAll = async () => {
    try {
        await Promise.all([loadUsers(), loadRooms(), loadOrders(), loadSmtp()]);
    } catch (error) {
        showMessage(usersError, error.message);
    }
};

loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage(loginError, '');
    loginButton.disabled = true;
    loginButton.textContent = '正在登录…';
    try {
        const data = await api('/api/pointere-console/login', {
            method: 'POST',
            body: {
                account: loginForm.elements.account.value.trim(),
                password: loginForm.elements.password.value
            }
        });
        localStorage.setItem(TOKEN_KEY, data.token);
        start(data.user);
    } catch (error) {
        showMessage(loginError, error.message);
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = '登录控制台';
    }
});

$('logout-button').addEventListener('click', logout);

$('user-refresh').addEventListener('click', () => {
    showMessage(usersError, '');
    loadUsers().catch(error => showMessage(usersError, error.message));
});
$('room-refresh').addEventListener('click', () => {
    loadRooms().catch(error => showMessage(usersError, error.message));
});
$('order-refresh').addEventListener('click', () => {
    loadOrders().catch(error => showMessage(ordersError, error.message));
});

let searchTimer = null;
userSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        showMessage(usersError, '');
        loadUsers().catch(error => showMessage(usersError, error.message));
    }, 300);
});

smtpForm.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage(smtpError, '');
    showMessage(smtpOk, '');
    const elements = smtpForm.elements;
    try {
        const data = await api('/api/pointere-console/smtp', {
            method: 'POST',
            body: {
                host: elements.host.value.trim(),
                port: Number(elements.port.value),
                secure: elements.secure.value === 'true',
                user: elements.user.value.trim(),
                pass: elements.pass.value,
                fromName: elements.fromName.value.trim()
            }
        });
        showMessage(smtpOk, '邮件设置已保存');
        fillSmtp({smtp: data.smtp, configured: Boolean(data.smtp.user && data.smtp.hasPassword)});
    } catch (error) {
        showMessage(smtpError, error.message);
    }
});

$('smtp-test').addEventListener('click', async () => {
    showMessage(smtpError, '');
    showMessage(smtpOk, '');
    const buttonEl = $('smtp-test');
    buttonEl.disabled = true;
    buttonEl.textContent = '正在连接…';
    try {
        await api('/api/pointere-console/smtp', {method: 'POST', body: {action: 'test'}});
        showMessage(smtpOk, 'SMTP 连接正常，可以发送验证邮件');
    } catch (error) {
        showMessage(smtpError, `SMTP 连接失败：${error.message}`);
    } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = '测试连接';
    }
});

const boot = async () => {
    const token = getToken();
    if (!token) {
        loginView.hidden = false;
        return;
    }
    try {
        const data = await api('/api/pointere-console/me');
        start(data.user);
    } catch (error) {
        loginView.hidden = false;
    }
};

boot();
