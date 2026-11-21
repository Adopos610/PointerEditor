import JSZip from '@turbowarp/jszip';
import {getAccount} from './pointer-account';

const CLOUD_BASE = window.POINTER_CLOUD_BASE || 'https://vable.ctspace.xyz/cloud';
const TOKEN_KEY = 'pointer.cloud.token';
const DEVICE_KEY = 'pointer.cloud.device';

const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
        localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
};

const toBase64 = buffer => {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return window.btoa(binary);
};

const readError = data => (data && data.error && data.error.message) || null;

const normalizeName = value => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        if (typeof value.realName === 'string') return value.realName;
        if (typeof value.defaultMessage === 'string') return value.defaultMessage;
        if (typeof value.name === 'string') return value.name;
        if (typeof value.title === 'string') return value.title;
        if (value.props) {
            if (typeof value.props.defaultMessage === 'string') return value.props.defaultMessage;
            if (typeof value.props.children === 'string') return value.props.children;
        }
    }
    return '未命名角色';
};

export const bootstrapCloud = () => {
    const account = getAccount();
    const body = {
        accountKey: getDeviceId(),
        accountName: '本机用户'
    };
    if (account && account.token) {
        body.pointereToken = account.token;
        if (account.user) {
            body.accountName = account.user.username || account.user.name || body.accountName;
        }
    }
    return fetch(`${CLOUD_BASE}/api/bootstrap`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    }).then(response => response.json().catch(() => ({})).then(data => {
        if (!response.ok || data.ok === false) {
            throw new Error(readError(data) || `云服务初始化失败（${response.status}）`);
        }
        localStorage.setItem(TOKEN_KEY, data.token);
        return data;
    })).catch(error => {
        if (error instanceof TypeError) {
            throw new Error('无法连接云服务，请确认 PointerCloud 已启动');
        }
        throw error;
    });
};

const requestJson = (path, options = {}, retry = true) => {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set('Content-Type', 'application/json');
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${CLOUD_BASE}${path}`, {...options, headers})
        .then(response => response.json().catch(() => ({})).then(data => {
            if (response.status === 401 && retry) {
                localStorage.removeItem(TOKEN_KEY);
                return bootstrapCloud().then(() => requestJson(path, options, false));
            }
            if (!response.ok || data.ok === false) {
                throw new Error(readError(data) || `云服务请求失败（${response.status}）`);
            }
            return data;
        }))
        .catch(error => {
            if (error instanceof TypeError) {
                throw new Error('无法连接云服务，请确认 PointerCloud 已启动');
            }
            throw error;
        });
};

export const getCloudStatus = () => requestJson('/api/license');

export const listCloud = kind => requestJson(`/api/projects${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);

export const renameCloud = (id, title) => requestJson(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({title})
});

export const deleteCloud = id => requestJson(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE'
});

export const uploadCloudProject = (vm, title) => vm.saveProjectSb3('arraybuffer').then(buffer => (
    requestJson('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
            title: title || '未命名作品',
            kind: 'project',
            fileBase64: toBase64(buffer)
        })
    })
));

export const createSpriteSb3 = (vm, targetId) => {
    const fullProject = JSON.parse(vm.toJSON());
    const spriteJson = JSON.parse(vm.toJSON(targetId));
    const stage = fullProject.targets.find(target => target.isStage);
    if (!stage) throw new Error('找不到舞台，无法导出角色');

    const project = {
        ...fullProject,
        targets: [stage, spriteJson],
        monitors: []
    };
    const files = vm.saveProjectSb3DontZip();
    const referencedAssets = new Set();
    for (const target of [stage, spriteJson]) {
        for (const costume of target.costumes || []) {
            if (costume.md5ext) referencedAssets.add(costume.md5ext);
        }
        for (const sound of target.sounds || []) {
            if (sound.md5ext) referencedAssets.add(sound.md5ext);
        }
    }

    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    for (const [name, data] of Object.entries(files)) {
        if (name === 'project.json') continue;
        if (referencedAssets.has(name) || /\.(ttf|otf|woff2?)$/i.test(name)) {
            zip.file(name, data);
        }
    }
    return zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE'
    });
};

export const uploadCloudSprite = (vm, targetId, spriteName) => {
    const name = normalizeName(spriteName);
    return createSpriteSb3(vm, targetId).then(buffer => (
        requestJson('/api/projects', {
            method: 'POST',
            body: JSON.stringify({
                title: name,
                kind: 'sprite',
                spriteName: name,
                fileBase64: toBase64(buffer)
            })
        })
    ));
};

export const downloadCloud = (id, retry = true) => {
    const token = localStorage.getItem(TOKEN_KEY);
    return fetch(`${CLOUD_BASE}/api/projects/${encodeURIComponent(id)}/file`, {
        headers: token ? {Authorization: `Bearer ${token}`} : {}
    }).then(response => {
        if (response.status === 401 && retry) {
            localStorage.removeItem(TOKEN_KEY);
            return bootstrapCloud().then(() => downloadCloud(id, false));
        }
        if (!response.ok) {
            return response.json().catch(() => ({})).then(data => {
                throw new Error((data.error && data.error.message) || '下载失败');
            });
        }
        return response.blob();
    });
};
