'use strict';

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('pointerCommunity', {
    request: payload => ipcRenderer.invoke('pointer:community-request', payload)
});

contextBridge.exposeInMainWorld('pointerAgent', {
    getConfig: () => ipcRenderer.invoke('pointer:peagent-config-get'),
    saveConfig: config => ipcRenderer.invoke('pointer:peagent-config-set', config),
    clearConfig: () => ipcRenderer.invoke('pointer:peagent-clear'),
    chat: payload => ipcRenderer.invoke('pointer:peagent-chat', payload),
    chatStream: (payload, onEvent) => {
        const requestId = payload && payload.requestId;
        if (!requestId) return Promise.reject(new Error('缺少请求 ID'));
        const listener = (event, message) => {
            if (message && message.requestId === requestId && typeof onEvent === 'function') {
                onEvent(message);
            }
        };
        ipcRenderer.on('pointer:peagent-stream', listener);
        return ipcRenderer.invoke('pointer:peagent-chat-stream', payload)
            .finally(() => ipcRenderer.removeListener('pointer:peagent-stream', listener));
    },
    cancelChat: requestId => ipcRenderer.invoke('pointer:peagent-cancel', requestId),
    search: query => ipcRenderer.invoke('pointer:peagent-search', query)
});

contextBridge.exposeInMainWorld('pointerSecurity', {
    fetchSource: url => ipcRenderer.invoke('pointer:security-fetch', url)
});

contextBridge.exposeInMainWorld('pointerDesktop', {
    openNewWindow: () => ipcRenderer.invoke('pointer:new-window'),
    getLaunchProject: () => ipcRenderer.invoke('pointer:get-launch-project'),
    openProjectDialog: () => ipcRenderer.invoke('pointer:open-project-dialog'),
    saveProject: (filePath, dataBase64) => ipcRenderer.invoke('pointer:save-project', {path: filePath, dataBase64}),
    saveProjectAs: (suggestedName, dataBase64) => ipcRenderer.invoke('pointer:save-project-as', {suggestedName, dataBase64}),
    saveProjectsBatch: items => ipcRenderer.invoke('pointer:save-projects-batch', {items}),
    onOpenProject: callback => {
        const listener = (event, payload) => callback(payload);
        ipcRenderer.on('pointer:open-project', listener);
        return () => ipcRenderer.removeListener('pointer:open-project', listener);
    }
});
