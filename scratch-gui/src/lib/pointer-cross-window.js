import {applyScratchXml} from './pointer-peagent';

const DB_NAME = 'pointere-cross-window';
const STORE_NAME = 'assets';
const TOKEN_PREFIX = 'pointere-asset:';
const MAX_AGE = 10 * 60 * 1000;

const openDb = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持跨窗口传输'));
        return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, {keyPath: 'token'});
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('跨窗口存储不可用'));
});

const putPayload = async (token, payload) => {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({token, payload, createdAt: Date.now()});
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('写入跨窗口数据失败'));
    });
    db.close();
};

const getPayload = async token => {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(token);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('读取跨窗口数据失败'));
    });
    db.close();
    return value;
};

const removePayload = async token => {
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(token);
        db.close();
    } catch (error) {
        // Cleanup is best-effort.
    }
};

export const makeTransferToken = () => (
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
);

export const startCrossWindowDrag = (event, payloadPromise) => {
    if (!event || !event.dataTransfer) return;
    const token = makeTransferToken();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', `${TOKEN_PREFIX}${token}`);
    event.dataTransfer.setData('application/x-pointere-token', token);
    Promise.resolve(payloadPromise)
        .then(payload => putPayload(token, payload))
        .catch(() => removePayload(token));
};

export const selectedBlockPayload = () => {
    const Blockly = typeof window !== 'undefined' ? window.ScratchBlocks : null;
    if (!Blockly || !Blockly.selected || !Blockly.Xml) return Promise.reject(new Error('请先在积木区选中一段积木'));
    const block = Blockly.selected;
    const dom = Blockly.Xml.textToDom('<xml xmlns="http://www.w3.org/1999/xhtml"></xml>');
    dom.appendChild(Blockly.Xml.blockToDom(block));
    return Promise.resolve({
        kind: 'blocks',
        xml: Blockly.Xml.domToText(dom),
        name: block.type || '积木'
    });
};

export const spritePayload = (vm, targetId) => {
    if (!vm || !vm.exportSprite) return Promise.reject(new Error('编辑器尚未准备好'));
    const target = targetId || (vm.editingTarget && vm.editingTarget.id);
    if (!target) return Promise.reject(new Error('没有可导出的角色'));
    const name = vm.editingTarget ? vm.editingTarget.getName() : '角色';
    return vm.exportSprite(target, 'uint8array').then(buffer => ({
        kind: 'sprite',
        name,
        buffer
    }));
};

export const readCrossWindowPayload = async dataTransfer => {
    if (!dataTransfer) return null;
    const text = dataTransfer.getData('text/plain') || '';
    if (!text.startsWith(TOKEN_PREFIX)) return null;
    const token = text.slice(TOKEN_PREFIX.length);
    const started = Date.now();
    while (Date.now() - started < 3000) {
        const entry = await getPayload(token).catch(() => null);
        if (entry && entry.payload) {
            if (Date.now() - entry.createdAt > MAX_AGE) {
                removePayload(token);
                return null;
            }
            removePayload(token);
            return entry.payload;
        }
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    return null;
};

export const applyPayloadToEditor = async (vm, payload) => {
    if (!payload || !vm) return null;
    if (payload.kind === 'blocks') {
        const count = applyScratchXml(vm, payload.xml);
        return {ok: true, message: `已导入 ${count} 个积木`};
    }
    if (payload.kind === 'sprite') {
        const before = new Set(vm.runtime.targets.map(target => target.id));
        await vm.addSprite(payload.buffer);
        const added = vm.runtime.targets.find(target => !before.has(target.id) && !target.isStage);
        if (added) vm.setEditingTarget(added.id);
        return {ok: true, message: `已导入角色「${payload.name || (added && added.getName()) || '新角色'}」`};
    }
    return null;
};
