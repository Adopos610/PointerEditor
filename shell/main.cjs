'use strict';

const {app, BrowserWindow, Menu, session, shell, ipcMain, dialog} = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

if (process.env.POINTER_CDP_PORT) {
    app.commandLine.appendSwitch('remote-debugging-port', process.env.POINTER_CDP_PORT);
    app.commandLine.appendSwitch('remote-allow-origins', '*');
}

const DEV_URL = process.env.POINTER_DEV_URL;
const isDev = Boolean(DEV_URL);

const COMMUNITY_API_BASE = 'https://forum.ctspace.xyz/api';
const PROJECT_FILE_RE = /\.(sb3|sb2|sb)$/i;
const PROJECT_FILTERS = [
    {name: 'Scratch 项目', extensions: ['sb3', 'sb2', 'sb']},
    {name: '所有文件', extensions: ['*']}
];
const {registerPeAgent} = require('./peagent.cjs');

const findProjectFileArg = argv => {
    for (let index = argv.length - 1; index >= 0; index -= 1) {
        const value = String(argv[index] || '');
        if (!PROJECT_FILE_RE.test(value)) continue;
        try {
            const resolved = path.resolve(value);
            if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
        } catch (error) {
            // Ignore invalid command line arguments.
        }
    }
    return null;
};

const allowedProjectPaths = new Set();

const readProjectFile = filePath => {
    const resolved = path.resolve(filePath);
    if (!PROJECT_FILE_RE.test(resolved)) throw new Error('只支持 .sb3 / .sb2 / .sb 项目文件');
    const data = fs.readFileSync(resolved);
    allowedProjectPaths.add(resolved);
    return {
        path: resolved,
        name: path.basename(resolved),
        dataBase64: data.toString('base64')
    };
};

let pendingLaunchFile = findProjectFileArg(process.argv);

const communityRequest = async payload => {
    const {method = 'GET', path: apiPath, token, json, file, fileDisplayName} = payload || {};
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/')) {
        return {ok: false, status: 0, message: '无效的接口路径'};
    }
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (file && file.data) {
        const form = new FormData();
        const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
        form.append('file', new Blob([bytes], {type: file.type || 'application/octet-stream'}), file.filename || 'upload.bin');
        if (fileDisplayName) form.append('name', fileDisplayName);
        body = form;
    } else if (json) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
    }

    let response;
    try {
        response = await fetch(`${COMMUNITY_API_BASE}${apiPath}`, {method, headers, body});
    } catch (error) {
        return {ok: false, status: 0, message: '无法连接创客次元，请检查网络后重试'};
    }

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
        return {ok: false, status: response.status, message};
    }
    return {ok: true, status: response.status, data};
};

ipcMain.handle('pointer:community-request', (event, payload) => communityRequest(payload));

ipcMain.handle('pointer:get-launch-project', () => {
    const file = pendingLaunchFile;
    pendingLaunchFile = null;
    if (!file) return null;
    try {
        return readProjectFile(file);
    } catch (error) {
        return null;
    }
});

ipcMain.handle('pointer:open-project-dialog', async () => {
    const result = await dialog.showOpenDialog({
        title: '打开 PointerEditor 项目',
        properties: ['openFile'],
        filters: PROJECT_FILTERS
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return null;
    return readProjectFile(result.filePaths[0]);
});

ipcMain.handle('pointer:save-project', async (event, payload) => {
    try {
        const target = path.resolve(String(payload && payload.path || ''));
        if (!PROJECT_FILE_RE.test(target)) return {ok: false, error: '只支持 .sb3 / .sb2 / .sb 项目文件'};
        if (!allowedProjectPaths.has(target)) return {ok: false, error: '请通过“另存为”选择保存位置'};
        const bytes = typeof payload.dataBase64 === 'string'
            ? Buffer.from(payload.dataBase64, 'base64')
            : Buffer.alloc(0);
        if (!bytes.length) return {ok: false, error: '项目数据为空'};
        await fs.promises.writeFile(target, bytes);
        return {ok: true, path: target, name: path.basename(target)};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});

ipcMain.handle('pointer:save-project-as', async (event, payload) => {
    try {
        const suggested = path.basename(String(payload && payload.suggestedName || 'PointerEditor-项目.sb3'))
            .replace(/[<>:"/\|?*\u0000-\u001f]/g, '_');
        const fileName = PROJECT_FILE_RE.test(suggested) ? suggested : `${suggested.replace(/\.sb[23]?$/i, '')}.sb3`;
        const result = await dialog.showSaveDialog({
            title: '保存 PointerEditor 项目',
            defaultPath: path.join(app.getPath('downloads'), fileName),
            filters: PROJECT_FILTERS
        });
        if (result.canceled || !result.filePath) return {ok: false, canceled: true};
        const target = PROJECT_FILE_RE.test(result.filePath) ? result.filePath : `${result.filePath}.sb3`;
        const bytes = typeof payload.dataBase64 === 'string'
            ? Buffer.from(payload.dataBase64, 'base64')
            : Buffer.alloc(0);
        if (!bytes.length) return {ok: false, error: '项目数据为空'};
        await fs.promises.writeFile(target, bytes);
        allowedProjectPaths.add(path.resolve(target));
        return {ok: true, path: target, name: path.basename(target)};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});

const {writeProjectsToDirectory} = require('./batch-save.cjs');

ipcMain.handle('pointer:save-projects-batch', async (event, payload) => {
    try {
        const items = Array.isArray(payload && payload.items) ? payload.items : [];
        if (!items.length) return {ok: false, error: '没有可保存的标签页'};
        const result = await dialog.showOpenDialog({
            title: '批量保存所有标签页',
            defaultPath: app.getPath('downloads'),
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: '保存到此文件夹'
        });
        if (result.canceled || !result.filePaths || !result.filePaths[0]) return {ok: false, canceled: true};
        const dir = result.filePaths[0];
        const {saved, failed} = await writeProjectsToDirectory(dir, items);
        saved.forEach(entry => allowedProjectPaths.add(path.resolve(entry.path)));
        return {ok: true, dir, saved, failed};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});

const RECOVERY_LIMIT = 5;

ipcMain.handle('pointer:save-recovery', async (event, payload) => {
    try {
        const name = String(payload && payload.name || 'snapshot')
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 40) || 'snapshot';
        const bytes = typeof (payload && payload.dataBase64) === 'string'
            ? Buffer.from(payload.dataBase64, 'base64')
            : Buffer.alloc(0);
        if (!bytes.length || bytes.length > 64 * 1024 * 1024) return {ok: false, error: '快照数据无效'};
        const dir = path.join(dataRoot, 'Recovery');
        await fs.promises.mkdir(dir, {recursive: true});
        const target = path.join(dir, `recovery-${Date.now()}-${name}.sb3`);
        await fs.promises.writeFile(target, bytes);
        const files = (await fs.promises.readdir(dir))
            .filter(fileName => fileName.endsWith('.sb3'))
            .sort();
        while (files.length > RECOVERY_LIMIT) {
            const old = files.shift();
            await fs.promises.unlink(path.join(dir, old)).catch(() => {});
        }
        return {ok: true, path: target};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
const dataRoot = portableDir || (app.isPackaged
    ? path.dirname(process.execPath)
    : path.join(__dirname, '..', '.tmp', 'electron-data'));

const userDataDir = path.join(dataRoot, 'PointerEditorData');
fs.mkdirSync(path.join(userDataDir, 'Crashpad'), {recursive: true});
fs.mkdirSync(path.join(dataRoot, 'PointerEditorExports'), {recursive: true});
app.setPath('userData', userDataDir);
app.setPath('crashDumps', path.join(userDataDir, 'Crashpad'));
app.setPath('downloads', path.join(dataRoot, 'PointerEditorExports'));
registerPeAgent();

const guiRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'gui')
    : path.join(__dirname, '..', 'scratch-gui', 'build');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.sb3': 'application/octet-stream',
    '.hex': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8'
};

const sendFile = (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const isExtensionAsset = /[\\/]extensions[\\/]/.test(filePath);
    const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
        'Document-Isolation-Policy': 'isolate-and-credentialless',
        'Cross-Origin-Resource-Policy': isExtensionAsset ? 'cross-origin' : 'same-origin'
    };
    if (isExtensionAsset) headers['Access-Control-Allow-Origin'] = '*';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
};

const requestedGuiPort = Number(process.env.POINTER_GUI_PORT || 48210);
const GUI_PORT = Number.isInteger(requestedGuiPort) && requestedGuiPort > 0 && requestedGuiPort < 65536
    ? requestedGuiPort
    : 0;

const startStaticServer = () => new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        } catch (error) {
            res.writeHead(400);
            res.end('Bad request');
            return;
        }

        const relative = pathname === '/' ? 'editor.html' : pathname.replace(/^\/+/, '');
        let filePath = path.resolve(guiRoot, relative);
        const rootWithSep = guiRoot.endsWith(path.sep) ? guiRoot : guiRoot + path.sep;
        if (filePath !== guiRoot && !filePath.startsWith(rootWithSep)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.stat(filePath, (error, stats) => {
            if (!error && stats.isFile()) {
                sendFile(res, filePath);
                return;
            }
            if (!error && stats.isDirectory()) {
                const index = path.join(filePath, 'index.html');
                if (fs.existsSync(index)) {
                    sendFile(res, index);
                    return;
                }
            }
            const fallback = path.join(guiRoot, 'editor.html');
            fs.stat(fallback, (fallbackError) => {
                if (fallbackError) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                sendFile(res, fallback);
            });
        });
    });
    const listen = port => new Promise((listenResolve, listenReject) => {
        const onError = error => {
            server.removeListener('error', onError);
            if (error.code === 'EADDRINUSE' && port !== 0) {
                listen(0).then(listenResolve, listenReject);
                return;
            }
            listenReject(error);
        };
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', onError);
            listenResolve(server);
        });
    });
    listen(GUI_PORT).then(resolve, reject);
});

const isLocalUrl = (url) => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
    } catch (error) {
        return false;
    }
};

const configureSession = () => {
    const allowedPermissions = new Set([
        'media',
        'audioCapture',
        'videoCapture',
        'fullscreen',
        'pointerLock',
        'clipboard-sanitized-write'
    ]);
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(allowedPermissions.has(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
        allowedPermissions.has(permission)
    ));
};

let sharedGuiUrl = null;
const createWindow = async () => {
    let url = DEV_URL;
    if (!url) {
        if (!sharedGuiUrl) {
            const server = await startStaticServer();
            sharedGuiUrl = `http://127.0.0.1:${server.address().port}/editor.html`;
        }
        url = sharedGuiUrl;
    }

    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 680,
        backgroundColor: '#f0f7ff',
        title: 'PointerEditor',
        icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, 'build', 'icon.png'),
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(__dirname, 'preload.cjs'),
            webgl: true,
            backgroundThrottling: false
        }
    });

    win.once('ready-to-show', () => win.show());
    win.webContents.setWindowOpenHandler(({url: target}) => {
        if (/^https?:\/\//i.test(target) && !isLocalUrl(target)) {
            shell.openExternal(target);
        }
        return {action: 'deny'};
    });
    win.webContents.on('will-navigate', (event, target) => {
        if (!isLocalUrl(target)) {
            event.preventDefault();
            if (/^https?:\/\//i.test(target)) {
                shell.openExternal(target);
            }
        }
    });
    win.webContents.on('will-prevent-unload', event => {
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['直接退出', '取消'],
            defaultId: 1,
            cancelId: 1,
            title: 'PointerEditor',
            message: '当前作品有未保存的修改',
            detail: '直接退出会丢失未保存的修改，建议先保存到电脑。'
        });
        if (choice === 0) event.preventDefault();
    });
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') {
            win.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    await win.loadURL(url);
    return win;
};

ipcMain.handle('pointer:new-window', async () => {
    if (BrowserWindow.getAllWindows().length >= 8) {
        return {ok: false, error: '最多同时打开 8 个编辑器窗口'};
    }
    await createWindow();
    return {ok: true};
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv) => {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
        const file = findProjectFileArg(argv);
        if (file && win && !win.isDestroyed()) {
            try {
                const payload = readProjectFile(file);
                if (win.webContents.isLoading()) {
                    win.webContents.once('did-finish-load', () => {
                        if (!win.isDestroyed()) win.webContents.send('pointer:open-project', payload);
                    });
                } else {
                    win.webContents.send('pointer:open-project', payload);
                }
            } catch (error) {
                // Ignore malformed external open requests.
            }
        }
    });

    app.whenReady().then(async () => {
        Menu.setApplicationMenu(null);
        configureSession();
        try {
            await createWindow();
        } catch (error) {
            console.error('Failed to start PointerEditor window', error);
            app.quit();
        }
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
