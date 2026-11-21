'use strict';

const fs = require('fs');
const path = require('path');
const {app, ipcMain, safeStorage} = require('electron');
const {prepareMessages, toOpenAIContent, toAnthropicContent} = require('./peagent-messages.cjs');

const DEFAULTS = {
    provider: 'deepseek',
    apiFormat: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    temperature: 1,
    maxTokens: 16384,
    thinking: true,
    reasoningEffort: 'high',
    permission: 'confirm'
};

let registered = false;

const configFile = () => path.join(app.getPath('userData'), 'peagent-config.json');

const readConfig = () => {
    let config;
    try {
        config = {...DEFAULTS, ...JSON.parse(fs.readFileSync(configFile(), 'utf8'))};
    } catch (error) {
        config = {...DEFAULTS};
    }
    if (Number(config.maxTokens) <= 4096) config.maxTokens = DEFAULTS.maxTokens;
    return config;
};

const writeConfig = config => {
    const file = configFile();
    const temp = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});
    fs.renameSync(temp, file);
};

const publicConfig = () => {
    const config = readConfig();
    return {
        provider: config.provider,
        apiFormat: config.apiFormat,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        thinking: config.thinking !== false,
        reasoningEffort: config.reasoningEffort,
        permission: config.permission || 'confirm',
        hasKey: Boolean(config.apiKey)
    };
};

const decodeKey = config => {
    if (!config.apiKey) return '';
    try {
        if (config.apiKey.startsWith('enc:')) {
            return safeStorage.decryptString(Buffer.from(config.apiKey.slice(4), 'base64'));
        }
        if (config.apiKey.startsWith('b64:')) {
            return Buffer.from(config.apiKey.slice(4), 'base64').toString('utf8');
        }
    } catch (error) {
        return '';
    }
    return '';
};

const encodeKey = key => {
    if (safeStorage.isEncryptionAvailable()) {
        return `enc:${safeStorage.encryptString(key).toString('base64')}`;
    }
    return `b64:${Buffer.from(key, 'utf8').toString('base64')}`;
};

const normaliseBase = value => {
    let url;
    try {
        url = new URL(String(value || DEFAULTS.baseUrl).trim());
    } catch (error) {
        throw new Error('API Base URL 格式不正确');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('API Base URL 必须使用 https:// 或 http://');
    }
    return url.toString().replace(/\/+$/, '');
};

const stripHtml = value => String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const searchWeb = async query => {
    const clean = String(query || '').trim().slice(0, 200);
    if (!clean) return {ok: false, error: '搜索内容为空'};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
        response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(clean)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
            },
            signal: controller.signal
        });
    } catch (error) {
        clearTimeout(timer);
        return {ok: false, error: error.name === 'AbortError' ? '搜索超时' : `搜索失败：${error.message}`};
    }
    clearTimeout(timer);
    if (!response.ok) return {ok: false, error: `搜索服务返回 ${response.status}`};
    const html = await response.text();
    const snippets = [];
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = snippetPattern.exec(html)) && snippets.length < 12) {
        snippets.push(stripHtml(match[1]));
    }
    const results = [];
    const linkPattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let index = 0;
    while ((match = linkPattern.exec(html)) && results.length < 6) {
        const title = stripHtml(match[2]);
        let url = match[1];
        try {
            const parsed = new URL(url, 'https://duckduckgo.com');
            url = parsed.searchParams.get('uddg') || parsed.href;
        } catch (error) {
            // Keep the original link if the redirect URL can't be parsed.
        }
        if (title && url) results.push({title, url, snippet: snippets[index] || ''});
        index += 1;
    }
    if (!results.length) return {ok: false, error: '没有搜到结果，或搜索服务暂时不可用'};
    return {ok: true, query: clean, results};
};

const chat = async payload => {
    const config = readConfig();
    const apiKey = decodeKey(config);
    if (!apiKey) return {ok: false, code: 'no-key', error: '请先填写模型 API Key'};
    const prepared = prepareMessages(payload.messages);
    if (prepared.error) return {ok: false, error: prepared.error};
    const safeMessages = prepared.messages;
    const model = String(payload.model || config.model || DEFAULTS.model).slice(0, 80);
    const base = normaliseBase(payload.baseUrl || config.baseUrl);
    const apiFormat = (payload.apiFormat || config.apiFormat) === 'anthropic' ? 'anthropic' : 'openai';
    const numeric = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && value !== '' && value !== null && value !== undefined ?
            parsed : fallback;
    };
    const maxTokens = Math.max(128, Math.min(65536,
        numeric(payload.maxTokens, config.maxTokens || DEFAULTS.maxTokens)));
    const temperature = Math.max(0, Math.min(2,
        numeric(payload.temperature, config.temperature !== undefined ? config.temperature : DEFAULTS.temperature)));
    const thinking = payload.thinking !== undefined ? Boolean(payload.thinking) : config.thinking !== false;
    const effort = ['low', 'high', 'max'].includes(payload.reasoningEffort) ?
        payload.reasoningEffort : config.reasoningEffort || 'high';
    const deepseek = /deepseek\.com/i.test(base) || /^deepseek/i.test(model);
    const deepseekV4 = deepseek && /^deepseek-(flash|v4-pro|v4-flash)$/i.test(model);
    const legacyReasoner = /^deepseek-reasoner$/i.test(model);

    let endpoint;
    let headers;
    let body;
    if (apiFormat === 'anthropic') {
        endpoint = base.endsWith('/v1/messages') ? base : `${base}/v1/messages`;
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };
        const systemMessages = safeMessages.filter(item => item.role === 'system');
        const chatMessages = safeMessages.filter(item => item.role !== 'system');
        body = {
            model,
            max_tokens: maxTokens,
            messages: chatMessages.map(item => ({
                role: item.role === 'assistant' ? 'assistant' : 'user',
                content: toAnthropicContent(item.content)
            }))
        };
        if (systemMessages.length) body.system = systemMessages.map(item => item.content).join('\n\n');
        if (deepseek) {
            body.reasoning = {effort: thinking ? effort : 'none'};
        } else if (thinking) {
            body.thinking = {type: 'enabled', budget_tokens: Math.min(4096, Math.max(1024, maxTokens - 1024))};
        }
    } else {
        endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
        headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        };
        body = {
            model,
            messages: safeMessages.map(item => ({
                role: item.role,
                content: toOpenAIContent(item.content)
            })),
            stream: false,
            max_tokens: maxTokens
        };
        if (deepseekV4) {
            body.thinking = {type: thinking ? 'enabled' : 'disabled'};
            if (thinking) body.reasoning_effort = effort;
            else body.temperature = temperature;
        } else if (!legacyReasoner) {
            body.temperature = temperature;
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600000);
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (error) {
        clearTimeout(timer);
        return {ok: false, error: error.name === 'AbortError' ? '请求超时' : `网络错误：${error.message}`};
    }
    clearTimeout(timer);
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (error) {
        data = null;
    }
    if (!response.ok) {
        const message = data && data.error && data.error.message ?
            data.error.message : `API 请求失败（${response.status}）`;
        return {ok: false, status: response.status, error: message};
    }
    if (apiFormat === 'anthropic') {
        const blocks = data && Array.isArray(data.content) ? data.content : [];
        const content = blocks.filter(block => block && block.type === 'text')
            .map(block => block.text || '').join('\n').trim();
        const reasoning = blocks.filter(block => block && block.type === 'thinking')
            .map(block => block.thinking || '').join('\n').trim();
        if (!content && !reasoning) return {ok: false, error: 'API 返回格式不正确'};
        return {
            ok: true,
            content,
            reasoning,
            usage: data.usage || null,
            model: data.model || model
        };
    }
    const choice = data && data.choices && data.choices[0];
    const message = choice && choice.message;
    if (!message) return {ok: false, error: 'API 返回格式不正确'};
    return {
        ok: true,
        content: message.content || '',
        reasoning: message.reasoning_content || '',
        usage: data.usage || null,
        model: data.model || model
    };
};

const activeStreams = new Map();
const cancelledStreams = new Set();

const streamChat = async (event, payload) => {
    const requestId = String(payload.requestId || '').slice(0, 80);
    if (!requestId) return {ok: false, error: '缺少请求 ID'};
    const config = readConfig();
    const apiKey = decodeKey(config);
    if (!apiKey) return {ok: false, code: 'no-key', error: '请先填写模型 API Key'};
    const prepared = prepareMessages(payload.messages);
    if (prepared.error) return {ok: false, error: prepared.error};
    const safeMessages = prepared.messages;
    const model = String(payload.model || config.model || DEFAULTS.model).slice(0, 80);
    const base = normaliseBase(payload.baseUrl || config.baseUrl);
    const apiFormat = (payload.apiFormat || config.apiFormat) === 'anthropic' ? 'anthropic' : 'openai';
    const numeric = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && value !== '' && value !== null && value !== undefined ?
            parsed : fallback;
    };
    const maxTokens = Math.max(128, Math.min(65536,
        numeric(payload.maxTokens, config.maxTokens || DEFAULTS.maxTokens)));
    const temperature = Math.max(0, Math.min(2,
        numeric(payload.temperature, config.temperature !== undefined ? config.temperature : DEFAULTS.temperature)));
    const thinking = payload.thinking !== undefined ? Boolean(payload.thinking) : config.thinking !== false;
    const effort = ['low', 'high', 'max'].includes(payload.reasoningEffort) ?
        payload.reasoningEffort : config.reasoningEffort || 'high';
    const deepseek = /deepseek\.com/i.test(base) || /^deepseek/i.test(model);
    const deepseekV4 = deepseek && /^deepseek-(flash|v4-pro|v4-flash)$/i.test(model);
    const legacyReasoner = /^deepseek-reasoner$/i.test(model);

    let endpoint;
    let headers;
    let body;
    if (apiFormat === 'anthropic') {
        endpoint = base.endsWith('/v1/messages') ? base : `${base}/v1/messages`;
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };
        const systemMessages = safeMessages.filter(item => item.role === 'system');
        const chatMessages = safeMessages.filter(item => item.role !== 'system');
        body = {
            model,
            max_tokens: maxTokens,
            stream: true,
            messages: chatMessages.map(item => ({
                role: item.role === 'assistant' ? 'assistant' : 'user',
                content: toAnthropicContent(item.content)
            }))
        };
        if (systemMessages.length) body.system = systemMessages.map(item => item.content).join('\n\n');
        if (deepseek) {
            body.reasoning = {effort: thinking ? effort : 'none'};
        } else if (thinking) {
            body.thinking = {type: 'enabled', budget_tokens: Math.min(4096, Math.max(1024, maxTokens - 1024))};
        }
    } else {
        endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
        headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        };
        body = {
            model,
            messages: safeMessages.map(item => ({
                role: item.role,
                content: toOpenAIContent(item.content)
            })),
            stream: true,
            max_tokens: maxTokens
        };
        if (deepseekV4) {
            body.thinking = {type: thinking ? 'enabled' : 'disabled'};
            if (thinking) body.reasoning_effort = effort;
            else body.temperature = temperature;
        } else if (!legacyReasoner) {
            body.temperature = temperature;
        }
    }

    const controller = new AbortController();
    activeStreams.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), 600000);
    const send = message => {
        try {
            if (!event.sender.isDestroyed()) {
                event.sender.send('pointer:peagent-stream', {...message, requestId});
            }
        } catch (error) {
            // The renderer may have been closed; the request will still finish.
        }
    };
    let content = '';
    let reasoning = '';
    let usage = null;
    let responseModel = model;
    let finishReason = '';

    const handleData = (raw, eventName) => {
        const value = String(raw || '').trim();
        if (!value || value === '[DONE]') return;
        let data = null;
        try {
            data = JSON.parse(value);
        } catch (error) {
            return;
        }
        if (apiFormat === 'anthropic') {
            const type = data.type || eventName;
            if (type === 'message_start' && data.message) {
                if (data.message.model) responseModel = data.message.model;
                if (data.message.usage) usage = data.message.usage;
                return;
            }
            if (type === 'content_block_delta' && data.delta) {
                if (data.delta.type === 'thinking_delta' && data.delta.thinking) {
                    reasoning += data.delta.thinking;
                    send({type: 'reasoning', text: data.delta.thinking});
                } else if (data.delta.type === 'text_delta' && data.delta.text) {
                    content += data.delta.text;
                    send({type: 'delta', text: data.delta.text});
                }
                return;
            }
            if (type === 'message_delta') {
                if (data.usage) usage = {...(usage || {}), ...data.usage};
                const stopReason = data.delta && data.delta.stop_reason;
                if (stopReason) finishReason = stopReason;
            }
            return;
        }
        const choice = data.choices && data.choices[0];
        if (choice && choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice && choice.delta;
        if (delta) {
            if (delta.reasoning_content) {
                reasoning += delta.reasoning_content;
                send({type: 'reasoning', text: delta.reasoning_content});
            }
            if (delta.content) {
                content += delta.content;
                send({type: 'delta', text: delta.content});
            }
        }
        if (data.usage) usage = data.usage;
        if (data.model) responseModel = data.model;
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) {
            const text = await response.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
            const message = data && data.error && data.error.message ?
                data.error.message : `API 请求失败（${response.status}）`;
            send({type: 'error', error: message});
            return {ok: false, status: response.status, error: message};
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventName = '';
        const processLine = line => {
            if (!line) { eventName = ''; return; }
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
                return;
            }
            if (!line.startsWith('data:')) return;
            handleData(line.slice(5).trim(), eventName);
        };
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
            let newline = buffer.indexOf('\n');
            while (newline >= 0) {
                let line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (line.endsWith('\r')) line = line.slice(0, -1);
                processLine(line);
                newline = buffer.indexOf('\n');
            }
        }
        buffer += decoder.decode();
        processLine(buffer);
        if (finishReason === 'length' || finishReason === 'max_tokens') {
            send({
                type: 'notice',
                text: '本次输出达到 Max Tokens 上限，可在设置中提高 Max Tokens 后重试。'
            });
        }
        const result = {ok: true, content, reasoning, usage, model: responseModel, finishReason};
        send({type: 'done', ...result});
        return result;
    } catch (error) {
        if (cancelledStreams.has(requestId) || error.name === 'AbortError') {
            send({type: 'cancelled'});
            return {ok: false, cancelled: true};
        }
        send({type: 'error', error: `网络错误：${error.message}`});
        return {ok: false, error: `网络错误：${error.message}`};
    } finally {
        clearTimeout(timer);
        activeStreams.delete(requestId);
        cancelledStreams.delete(requestId);
    }
};

const registerPeAgent = () => {
    if (registered) return;
    registered = true;

    ipcMain.handle('pointer:security-fetch', async (event, rawUrl) => {
        const url = String(rawUrl || '');
        if (!/^https?:\/\//i.test(url)) return {ok: false, error: '仅支持 http/https 地址'};
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, {
                redirect: 'follow',
                signal: controller.signal,
                headers: {'User-Agent': 'PointerEditor-SecurityAnalyzer/1.0'}
            });
            if (!response.ok) return {ok: false, error: `读取源码失败（${response.status}）`};
            const text = await response.text();
            if (text.length > 512000) return {ok: false, error: '扩展源码过大，跳过源码扫描'};
            return {ok: true, source: text, finalUrl: response.url || url};
        } catch (error) {
            return {ok: false, error: error.name === 'AbortError' ? '读取源码超时' : `读取源码失败：${error.message}`};
        } finally {
            clearTimeout(timer);
        }
    });

    ipcMain.handle('pointer:peagent-config-get', () => publicConfig());

    ipcMain.handle('pointer:peagent-config-set', (event, payload) => {
        const safePayload = payload || {};
        const current = readConfig();
        const next = {
            ...current,
            provider: ['deepseek', 'openai', 'custom'].includes(safePayload.provider) ?
                safePayload.provider : (current.provider || DEFAULTS.provider),
            apiFormat: safePayload.apiFormat === 'anthropic' ? 'anthropic' : 'openai',
            baseUrl: normaliseBase(safePayload.baseUrl || current.baseUrl),
            model: String(safePayload.model || current.model || DEFAULTS.model).slice(0, 80),
            temperature: Math.max(0, Math.min(2,
                Number.isFinite(Number(safePayload.temperature)) ?
                    Number(safePayload.temperature) : current.temperature)),
            maxTokens: Math.max(128, Math.min(32768,
                Number.isFinite(Number(safePayload.maxTokens)) ?
                    Number(safePayload.maxTokens) : current.maxTokens)),
            thinking: safePayload.thinking !== undefined ? Boolean(safePayload.thinking) : current.thinking !== false,
            reasoningEffort: ['low', 'high', 'max'].includes(safePayload.reasoningEffort) ?
                safePayload.reasoningEffort : (current.reasoningEffort || 'high'),
            permission: ['full', 'confirm', 'readonly'].includes(safePayload.permission) ?
                safePayload.permission : (current.permission || 'confirm')
        };
        if (safePayload.clearKey) {
            delete next.apiKey;
        } else if (typeof safePayload.apiKey === 'string' && safePayload.apiKey.trim()) {
            next.apiKey = encodeKey(safePayload.apiKey.trim());
        }
        writeConfig(next);
        return publicConfig();
    });

    ipcMain.handle('pointer:peagent-clear', () => {
        writeConfig({...DEFAULTS});
        return publicConfig();
    });

    ipcMain.handle('pointer:peagent-chat', (event, payload) => chat(payload || {}));
    ipcMain.handle('pointer:peagent-chat-stream', (event, payload) => streamChat(event, payload || {}));
    ipcMain.handle('pointer:peagent-cancel', (event, requestId) => {
        const id = String(requestId || '');
        const controller = activeStreams.get(id);
        if (!controller) return {ok: false};
        cancelledStreams.add(id);
        controller.abort();
        return {ok: true};
    });
    ipcMain.handle('pointer:peagent-search', (event, query) => searchWeb(query));
};

module.exports = {registerPeAgent};
