export const OFFICIAL_SERVERS = [
    {
        id: 'official-1',
        label: '指针迭代官方节点1（默认）',
        url: 'wss://vable.ctspace.xyz'
    }
];

const DEFAULT_SERVER = OFFICIAL_SERVERS[0].url;
const OFFICIAL_API = 'https://vable.ctspace.xyz/api';

export const isOfficialServer = value => {
    try {
        return new URL(normalizeServer(value)).hostname === 'vable.ctspace.xyz';
    } catch (error) {
        return false;
    }
};

export const fetchCollabToken = (accountToken, room, timeout = 8000) => {
    if (!accountToken || !room) return Promise.resolve('');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    return fetch(`${OFFICIAL_API}/collab-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accountToken}`
        },
        body: JSON.stringify({room}),
        signal: controller ? controller.signal : undefined
    })
        .then(response => (response.ok ? response.json() : null))
        .then(data => (data && typeof data.token === 'string' ? data.token : ''))
        .catch(() => '')
        .finally(() => {
            if (timer) clearTimeout(timer);
        });
};

export const MAX_SNAPSHOT_BASE64 = 40 * 1024 * 1024;
export const MAX_TARGET_BLOCKS = 4 * 1024 * 1024;

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const makeRoomCode = () => {
    const bytes = new Uint8Array(6);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }
    let code = '';
    for (let index = 0; index < bytes.length; index++) {
        code += ROOM_ALPHABET[bytes[index] % ROOM_ALPHABET.length];
    }
    return code;
};

export const normalizeRoomCode = value => String(value || '').trim().toUpperCase();

export const normalizeServer = value => {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_SERVER;
    if (/^wss?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(raw)) return raw.replace(/^http/i, 'ws').replace(/\/+$/, '');
    return `ws://${raw.replace(/\/+$/, '')}`;
};

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

export const isInsecureServer = value => {
    try {
        const url = new URL(normalizeServer(value));
        return url.protocol === 'ws:' && !LOCAL_HOST.test(url.hostname);
    } catch (error) {
        return false;
    }
};

const OFFICIAL_EXTENSION_FILES = new Set(['pointer-toolbox.js', 'pointer-math.js']);

/**
 * The host may have loaded our extensions from its own local server
 * (http://127.0.0.1:<port>/extensions/...) or from the website. Those URLs
 * are not reliable for other room members, so map the official files to the
 * public download host before the project is applied.
 */
export const canonicalExtensionURL = value => {
    try {
        const url = new URL(String(value || ''));
        const isLocal = /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/.test(url.hostname);
        const isWebsite = url.hostname === 'peditor.ctspace.xyz' ||
            (url.hostname === 'adopos610.github.io' && url.pathname.startsWith('/PointerEditor/'));
        if (!isLocal && !isWebsite) return value;
        const pathname = url.pathname.replace(/^\/PointerEditor/, '');
        const fileName = pathname.split('/').pop();
        if (pathname.startsWith('/extensions/') && OFFICIAL_EXTENSION_FILES.has(fileName)) {
            return `https://peditor.ctspace.xyz/extensions/${fileName}`;
        }
        return value;
    } catch (error) {
        return value;
    }
};

export const arrayBufferToBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
};

export const base64ToArrayBuffer = base64 => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
};

export const encodeProjectSnapshot = vm => Promise.resolve(vm.saveProjectSb3('blob'))
    .then(blob => blob.arrayBuffer())
    .then(arrayBufferToBase64)
    .then(data => {
        if (data.length > MAX_SNAPSHOT_BASE64) {
            throw new Error('项目过大，超过协作同步上限（约 30MB）');
        }
        return data;
    });

export {DEFAULT_SERVER};

export default class CollabSession {
    constructor ({server, room, token, password, handlers}) {
        this.server = normalizeServer(server);
        this.room = normalizeRoomCode(room);
        this.token = token;
        this.password = String(password || '');
        this.handlers = handlers || {};
        this.socket = null;
        this.selfId = null;
        this.closed = false;
    }

    connect () {
        const socket = new WebSocket(this.server);
        this.socket = socket;
        socket.onopen = () => {
            this.send({
                type: 'join',
                room: this.room,
                token: this.token,
                password: this.password
            });
        };
        socket.onmessage = event => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                return;
            }
            if (!message || typeof message.type !== 'string') return;
            switch (message.type) {
            case 'joined':
                this.selfId = message.id;
                if (this.handlers.onJoined) this.handlers.onJoined(message);
                break;
            case 'peers':
                if (this.handlers.onPeers) this.handlers.onPeers(message);
                break;
            case 'state':
                if (this.handlers.onState) this.handlers.onState(message);
                break;
            case 'state-request':
                if (this.handlers.onStateRequest) this.handlers.onStateRequest(message);
                break;
            case 'blocks':
                if (this.handlers.onBlocks) this.handlers.onBlocks(message);
                break;
            case 'locks':
                if (this.handlers.onLocks) this.handlers.onLocks(message);
                break;
            case 'notice':
                if (this.handlers.onNotice) this.handlers.onNotice(message);
                break;
            case 'lock-request':
                if (this.handlers.onLockRequest) this.handlers.onLockRequest(message);
                break;
            case 'lock-response':
                if (this.handlers.onLockResponse) this.handlers.onLockResponse(message);
                break;
            case 'chat':
                if (this.handlers.onChat) this.handlers.onChat(message);
                break;
            case 'todo':
                if (this.handlers.onTodo) this.handlers.onTodo(message);
                break;
            case 'error':
                if (this.handlers.onError) {
                    this.handlers.onError(message.message || '连接出错', message);
                }
                break;
            default:
                break;
            }
        };
        socket.onerror = () => {
            if (this.handlers.onError) this.handlers.onError('无法连接协作服务器，请检查地址或网络');
        };
        socket.onclose = () => {
            const wasClosed = this.closed;
            this.closed = true;
            if (this.handlers.onClose) this.handlers.onClose(wasClosed);
        };
        return this;
    }

    send (payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        const text = JSON.stringify(payload);
        if (text.length > 48 * 1024 * 1024) {
            if (this.handlers.onError) this.handlers.onError('项目文件过大，无法通过协作同步');
            return false;
        }
        this.socket.send(text);
        return true;
    }

    sendState (data) {
        return this.send({type: 'state', data});
    }

    requestState () {
        return this.send({type: 'state-request'});
    }

    sendBlocks (targetId, data) {
        return this.send({type: 'blocks', targetId, data});
    }

    sendTodos (todos) {
        return this.send({type: 'todo', todos});
    }

    claim (targetId) {
        return this.send({type: 'claim', targetId});
    }

    release (targetId) {
        return this.send({type: 'release', targetId});
    }

    setHostLock (locked) {
        return this.send({type: 'host-lock', locked});
    }

    requestLock (targetId) {
        return this.send({type: 'lock-request', targetId});
    }

    respondLock (targetId, to, granted) {
        return this.send({type: 'lock-response', targetId, to, granted});
    }

    close () {
        this.closed = true;
        if (this.socket) {
            try {
                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({type: 'leave'}));
                }
                this.socket.close();
            } catch (error) {
                // ignored
            }
        }
    }
}
