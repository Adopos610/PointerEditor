import {sanitizeSvg} from '@turbowarp/scratch-svg-renderer';
import {buildProjectContext} from './pointer-agent-context';

const AGENT_DEFAULTS = {
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

export const PEAGENT_PROVIDERS = [
    {
        value: 'deepseek',
        label: 'DeepSeek V4',
        icon: 'D',
        baseUrl: 'https://api.deepseek.com',
        anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
        keyUrl: 'https://platform.deepseek.com/api_keys',
        models: [
            {value: 'deepseek-flash', label: 'deepseek-flash · V4.1 Flash（1M 上下文，支持图像）'},
            {value: 'deepseek-v4-pro', label: 'deepseek-v4-pro · V4 Pro（1M 上下文）'}
        ]
    },
    {
        value: 'openai',
        label: 'OpenAI',
        icon: 'O',
        baseUrl: 'https://api.openai.com/v1',
        keyUrl: 'https://platform.openai.com/api-keys',
        models: [
            {value: 'gpt-4.1', label: 'gpt-4.1'},
            {value: 'gpt-4o', label: 'gpt-4o'},
            {value: 'o4-mini', label: 'o4-mini'}
        ]
    },
    {
        value: 'custom',
        label: '自定义 / 其他 OpenAI 兼容模型',
        icon: 'C',
        baseUrl: '',
        keyUrl: '',
        models: []
    }
];

export const PEAGENT_MODELS = PEAGENT_PROVIDERS[0].models;

export const PEAGENT_FORMATS = [
    {value: 'openai', label: 'OpenAI 兼容（/chat/completions）'},
    {value: 'anthropic', label: 'Anthropic 兼容（/v1/messages）'}
];

export const PEAGENT_EFFORTS = [
    {value: 'low', label: '快速 · low'},
    {value: 'high', label: '均衡 · high'},
    {value: 'max', label: '最强 · max'}
];

export const getPeAgentProvider = value => (
    PEAGENT_PROVIDERS.find(item => item.value === value) || PEAGENT_PROVIDERS[2]
);

export const isPeAgentAvailable = () => typeof window !== 'undefined' && Boolean(window.pointerAgent);

const unavailable = () => {
    const error = new Error('PEAgent 需要桌面版环境；网页版暂不支持本地 API Key 调用');
    error.code = 'unavailable';
    throw error;
};

export const getPeAgentConfig = () => {
    if (!isPeAgentAvailable()) {
        return Promise.resolve({...AGENT_DEFAULTS, hasKey: false, unavailable: true});
    }
    return window.pointerAgent.getConfig();
};

export const savePeAgentConfig = config => {
    if (!isPeAgentAvailable()) return unavailable();
    return window.pointerAgent.saveConfig(config);
};

export const clearPeAgentConfig = () => {
    if (!isPeAgentAvailable()) return unavailable();
    return window.pointerAgent.clearConfig();
};

export const peagentChat = payload => {
    if (!isPeAgentAvailable()) return unavailable();
    return window.pointerAgent.chat(payload);
};

export const peagentSearch = query => {
    if (!isPeAgentAvailable()) return unavailable();
    return window.pointerAgent.search(query);
};

export const peagentChatStream = (payload, onEvent) => {
    if (!isPeAgentAvailable() || typeof window.pointerAgent.chatStream !== 'function') {
        return unavailable();
    }
    return window.pointerAgent.chatStream(payload, onEvent);
};

export const cancelPeAgentChat = requestId => {
    if (!isPeAgentAvailable() || typeof window.pointerAgent.cancelChat !== 'function') return Promise.resolve();
    return window.pointerAgent.cancelChat(requestId);
};

export const AGENT_GREETING = '你好，我是 PEAgent。告诉我想让角色做什么，我可以帮你生成积木、创建变量和广播，也能直接绘制 SVG 造型。\n\n例如：「做一个接苹果小游戏，变量记录分数」或「画一只蓝色的小猫角色」。';

const SESSIONS_KEY = 'pointere.peagent.sessions.v1';
const ACTIVE_SESSION_KEY = 'pointere.peagent.activeSession.v1';
const MAX_SESSIONS = 30;
const MAX_MESSAGES = 160;

const safeReadStorage = key => {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        return null;
    }
};

const safeWriteStorage = (key, value) => {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
};

const normalizeSessionMessages = messages => (
    Array.isArray(messages) ? messages
        .filter(message => message && ['user', 'assistant', 'system'].includes(message.role))
        .filter(message => message.role !== 'assistant' || message.content || message.reasoning || message.cancelled)
        .slice(-MAX_MESSAGES)
        .map(message => ({
            role: message.role,
            content: String(message.content || '').slice(0, 200000),
            reasoning: String(message.reasoning || '').slice(0, 100000),
            cancelled: Boolean(message.cancelled)
        })) : []
);

export const derivePeAgentSessionTitle = messages => {
    const firstUser = (messages || []).find(message => message.role === 'user');
    if (!firstUser) return '新对话';
    const title = String(firstUser.content || '').replace(/\s+/g, ' ').trim();
    return title ? title.slice(0, 26) : '新对话';
};

export const createPeAgentSession = (messages = [{role: 'assistant', content: AGENT_GREETING}]) => ({
    id: `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: derivePeAgentSessionTitle(messages),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: normalizeSessionMessages(messages)
});

export const loadPeAgentSessions = () => {
    const raw = safeReadStorage(SESSIONS_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(session => session && session.id && Array.isArray(session.messages))
            .slice(0, MAX_SESSIONS)
            .map(session => ({
                id: String(session.id),
                title: String(session.title || derivePeAgentSessionTitle(session.messages)).slice(0, 40),
                createdAt: Number(session.createdAt) || Date.now(),
                updatedAt: Number(session.updatedAt) || Date.now(),
                messages: normalizeSessionMessages(session.messages)
            }));
    } catch (error) {
        return [];
    }
};

export const savePeAgentSessions = sessions => {
    let list = (Array.isArray(sessions) ? sessions : [])
        .slice(0, MAX_SESSIONS)
        .map(session => ({
            ...session,
            messages: normalizeSessionMessages(session.messages)
        }));
    let json = JSON.stringify(list);
    while (list.length > 1 && json.length > 3500000) {
        list = list.slice(0, list.length - 1);
        json = JSON.stringify(list);
    }
    return safeWriteStorage(SESSIONS_KEY, json);
};

export const getActivePeAgentSessionId = () => safeReadStorage(ACTIVE_SESSION_KEY);

export const setActivePeAgentSessionId = id => {
    safeWriteStorage(ACTIVE_SESSION_KEY, String(id || ''));
};

export const extractScratchXml = content => {
    const source = String(content || '');
    const fenced = source.match(/```(?:xml|scratch)?\s*([\s\S]*?<xml[\s\S]*?<\/xml>[\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();
    const direct = source.match(/<xml[\s\S]*?<\/xml>/i);
    return direct ? direct[0].trim() : null;
};

const targetBlockTypes = (vm, target) => {
    if (!vm || !vm.runtime || !target || typeof vm.runtime.getBlocksXML !== 'function') return [];
    const categories = vm.runtime.getBlocksXML(target) || [];
    const types = new Set();
    categories.forEach(category => {
        const xml = category && category.xml ? category.xml : '';
        const matcher = /<block[^>]*\btype="([^"]+)"/g;
        let match;
        while ((match = matcher.exec(xml))) {
            if (match[1]) types.add(match[1]);
        }
    });
    return [...types].slice(0, 260);
};

export const buildPeAgentContext = vm => {
    const target = vm && vm.editingTarget;
    if (!target) return '当前没有打开的角色。';
    const blockCount = target.blocks && target.blocks._blocks ?
        Object.keys(target.blocks._blocks).length : 0;
    let projectContext;
    try {
        projectContext = buildProjectContext(vm);
    } catch (error) {
        projectContext = [
            `当前角色：${target.isStage ? '舞台' : target.getName()}（${target.isStage ? 'stage' : 'sprite'}）`,
            `当前角色积木数量：${blockCount}`
        ].join('\n');
    }
    const types = targetBlockTypes(vm, target);
    const available = types.length ?
        `\n\n当前编辑角色可用积木 opcode（只能使用这些）：${types.join(', ')}` : '';
    return `${projectContext}${available}`;
};

const resolveVariableField = (field, target) => {
    const name = String(field.textContent || '').trim();
    if (!name) return;
    const isList = field.getAttribute('name') === 'LIST';
    const isBroadcast = field.getAttribute('name') === 'BROADCAST_OPTION';
    const type = isList ? 'list' : (isBroadcast ? 'broadcast_msg' : '');
    const variable = target && target.lookupVariableByNameAndType ?
        target.lookupVariableByNameAndType(name, type) : null;
    if (!variable) {
        throw new Error(`变量「${name}」不存在，请先在变量面板创建它`);
    }
    field.setAttribute('id', variable.id);
    field.textContent = variable.name;
};

const BLOCK_TYPE_ALIASES = {
    variables_set: 'data_setvariableto',
    variables_change: 'data_changevariableby',
    variables_show: 'data_showvariable',
    variables_hide: 'data_hidevariable',
    variables_showlist: 'data_showlist',
    variables_hidelist: 'data_hidelist'
};

export const applyScratchXml = (vm, xmlText) => {
    const text = String(xmlText || '').trim();
    if (!text) throw new Error('没有可应用的积木代码');
    const Blockly = typeof window !== 'undefined' ?
        (window.ScratchBlocks || window.Blockly) : null;
    if (!Blockly || typeof Blockly.getMainWorkspace !== 'function' || !Blockly.Blocks) {
        throw new Error('积木区尚未准备完成，请稍后再试');
    }
    const workspace = Blockly.getMainWorkspace();
    if (!workspace) throw new Error('没有打开积木工作区');
    let dom;
    try {
        dom = Blockly.Xml.textToDom(text);
    } catch (error) {
        throw new Error('模型返回的积木 XML 格式不正确');
    }
    const rootBlocks = [...dom.querySelectorAll('block')];
    if (!rootBlocks.length) throw new Error('模型没有返回积木');
    rootBlocks.forEach(block => {
        block.removeAttribute('id');
        const rawType = block.getAttribute('type');
        const type = BLOCK_TYPE_ALIASES[rawType] || rawType;
        if (type !== rawType) block.setAttribute('type', type);
        if (!type || !Blockly.Blocks[type]) {
            throw new Error(`不认识的积木类型：${rawType || '未知'}`);
        }
    });
    dom.querySelectorAll('shadow').forEach(shadow => shadow.removeAttribute('id'));
    const target = vm && vm.editingTarget;
    dom.querySelectorAll('field[name="VARIABLE"], field[name="LIST"], field[name="BROADCAST_OPTION"]').forEach(field => {
        resolveVariableField(field, target);
    });
    Blockly.Xml.domToWorkspace(dom, workspace);
    return dom.querySelectorAll('block').length;
};

const agentRandomId = () => (
    `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
);

const normalizeActionName = value => String(value || '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);

const ensureXmlRoot = value => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^<xml[\s>]/i.test(text)) return text;
    if (/^<block[\s>]/i.test(text)) {
        return `<xml xmlns="http://www.w3.org/1999/xhtml">${text}</xml>`;
    }
    return text;
};

const parseJsonValue = value => {
    try {
        return JSON.parse(String(value || '').trim());
    } catch (error) {
        return null;
    }
};

const normalizeActionKind = value => String(value || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');

const normalizeAgentAction = raw => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const kind = normalizeActionKind(raw.action || raw.type || raw.op || raw.tool);
        const name = normalizeActionName(raw.name || raw.variable || raw.broadcast || raw.title);
        const scope = String(raw.scope || '').toLowerCase() === 'local' ? 'local' : 'global';
        if (['createvariable', 'variable', 'addvariable', 'newvariable'].includes(kind) && name) {
            return {type: 'create_variable', name, scope};
        }
        if (['createbroadcast', 'broadcast', 'addbroadcast', 'newbroadcast'].includes(kind) && name) {
            return {type: 'create_broadcast', name};
        }
        if (['insertxml', 'insertblocks', 'scratchcode', 'customcode', 'code', 'insertcode'].includes(kind)) {
            const xml = ensureXmlRoot(raw.xml || raw.blocks || raw.code || raw.content);
            if (xml) return {type: 'insert_xml', xml};
        }
        if (['createsvgcostume', 'createcostume', 'svgcostume', 'drawcostume', 'drawsvg'].includes(kind)) {
            const svg = String(raw.svg || raw.code || raw.content || '').trim();
            if (svg) return {type: 'create_svg_costume', name: name || 'AI 造型', svg};
        }
    }
    return null;
};

const actionFromVariableBody = (body, type) => {
    const parsed = parseJsonValue(body);
    if (typeof parsed === 'string') {
        const name = normalizeActionName(parsed);
        return name ? {type, name, scope: 'global'} : null;
    }
    if (parsed && typeof parsed === 'object') {
        const name = normalizeActionName(parsed.name || parsed.variable || parsed.broadcast || parsed.title);
        if (!name) return null;
        if (type === 'create_variable') {
            return {
                type,
                name,
                scope: String(parsed.scope || '').toLowerCase() === 'local' ? 'local' : 'global'
            };
        }
        return {type, name};
    }
    const line = String(body || '').split('\n').map(item => item.trim()).find(Boolean) || '';
    const matched = line.match(/^(?:name|名称|变量名|广播名|变量|广播)\s*[:：=]\s*(.+)$/i);
    const name = normalizeActionName(matched ? matched[1] : line.replace(/^[-*]\s*/, ''));
    if (!name) return null;
    const local = /local|当前角色|角色变量/i.test(body);
    return type === 'create_variable' ? {type, name, scope: local ? 'local' : 'global'} : {type, name};
};

const extractSvgName = svg => {
    const matched = String(svg || '').match(/<!--\s*(?:name|title|造型名|名称)\s*[:：]\s*([\s\S]*?)-->/i);
    return matched ? normalizeActionName(matched[1]) : '';
};

export const parseAgentActions = content => {
    const source = String(content || '');
    const actions = [];
    const fencePattern = /```([A-Za-z0-9_-]*)[^\n]*\n([\s\S]*?)```/g;
    let match;
    while ((match = fencePattern.exec(source))) {
        const language = String(match[1] || '').toLowerCase();
        const body = String(match[2] || '').trim();
        if (!body) continue;
        if (['xml', 'scratch', 'scratch3', 'blockly'].includes(language) ||
            (!language && /^<xml[\s>]/i.test(body))) {
            actions.push({type: 'insert_xml', xml: ensureXmlRoot(body)});
            continue;
        }
        if (language === 'svg' || (!language && /^<svg[\s>]/i.test(body))) {
            const svg = body;
            actions.push({
                type: 'create_svg_costume',
                name: extractSvgName(svg) || 'AI 造型',
                svg
            });
            continue;
        }
        if (['agent', 'actions', 'agent-actions', 'agentactions', 'json-actions'].includes(language)) {
            const parsed = parseJsonValue(body);
            const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.actions) ? parsed.actions : []);
            list.slice(0, 16).forEach(raw => {
                const action = normalizeAgentAction(raw);
                if (action) actions.push(action);
            });
            continue;
        }
        if (['create-variable', 'createvariable', 'variable', 'create_variable'].includes(language)) {
            const action = actionFromVariableBody(body, 'create_variable');
            if (action) actions.push(action);
            continue;
        }
        if (['create-broadcast', 'createbroadcast', 'broadcast', 'create_broadcast'].includes(language)) {
            const action = actionFromVariableBody(body, 'create_broadcast');
            if (action) actions.push(action);
        }
    }
    if (!actions.some(action => action.type === 'insert_xml')) {
        const direct = extractScratchXml(source);
        if (direct) actions.push({type: 'insert_xml', xml: ensureXmlRoot(direct)});
    }
    const seenXml = new Set();
    const seenSvg = new Set();
    return actions.filter(action => {
        if (action.type === 'insert_xml') {
            if (seenXml.has(action.xml)) return false;
            seenXml.add(action.xml);
        }
        if (action.type === 'create_svg_costume') {
            if (seenSvg.has(action.svg)) return false;
            seenSvg.add(action.svg);
        }
        return true;
    }).slice(0, 20);
};

export const describeAgentAction = action => {
    if (!action) return '';
    if (action.type === 'create_variable') {
        return `${action.scope === 'local' ? '创建角色变量' : '创建全局变量'}「${action.name}」`;
    }
    if (action.type === 'create_broadcast') return `新建广播「${action.name}」`;
    if (action.type === 'insert_xml') {
        const count = (String(action.xml || '').match(/<block\b/g) || []).length;
        return count ? `插入 ${count} 个积木` : '插入积木脚本';
    }
    if (action.type === 'create_svg_costume') return `绘制 SVG 造型「${action.name}」`;
    return '执行 Agent 操作';
};



export const createAgentVariable = (vm, action) => {
    const target = action.scope === 'local' ?
        (vm && vm.editingTarget) : (vm && vm.runtime && vm.runtime.getTargetForStage());
    if (!target) throw new Error('找不到要创建变量的角色');
    const name = normalizeActionName(action.name);
    if (!name) throw new Error('变量名不能为空');
    const existing = target.lookupVariableByNameAndType(name, '', action.scope !== 'local');
    if (existing) return {type: 'create_variable', name, created: false, message: `变量「${name}」已存在`};
    target.createVariable(agentRandomId(), name, '', false);
    return {type: 'create_variable', name, created: true, message: `已创建变量「${name}」`};
};

export const createAgentBroadcast = (vm, action) => {
    const stage = vm && vm.runtime && vm.runtime.getTargetForStage();
    if (!stage) throw new Error('找不到舞台，无法新建广播');
    const name = normalizeActionName(action.name);
    if (!name) throw new Error('广播名不能为空');
    const existing = stage.lookupVariableByNameAndType(name, 'broadcast_msg');
    if (existing) return {type: 'create_broadcast', name, created: false, message: `广播「${name}」已存在`};
    stage.createVariable(agentRandomId(), name, 'broadcast_msg', false);
    return {type: 'create_broadcast', name, created: true, message: `已新建广播「${name}」`};
};

export const createAgentSvgCostume = async (vm, action) => {
    const source = String(action.svg || '').trim();
    if (!source) throw new Error('SVG 内容为空');
    if (source.length > 400000) throw new Error('SVG 内容过大');
    if (!/<svg[\s>]/i.test(source)) throw new Error('SVG 必须以 <svg> 开头');
    if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:/i.test(source)) {
        throw new Error('SVG 包含不安全内容，已拒绝添加');
    }
    if (/href\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(source)) {
        throw new Error('SVG 引用了外部资源，已拒绝添加');
    }
    const target = vm && vm.editingTarget;
    const storage = vm && vm.runtime && vm.runtime.storage;
    if (!target || !storage) throw new Error('舞台尚未准备完成');
    const bytes = sanitizeSvg.sanitizeByteStream(new TextEncoder().encode(source));
    const asset = storage.createAsset(
        storage.AssetType.ImageVector,
        storage.DataFormat.SVG,
        bytes,
        null,
        true
    );
    const costume = {
        name: normalizeActionName(action.name) || 'AI 造型',
        dataFormat: storage.DataFormat.SVG,
        asset,
        assetId: asset.assetId,
        md5: `${asset.assetId}.${storage.DataFormat.SVG}`
    };
    await vm.addCostume(costume.md5, costume, target.id);
    return {type: 'create_svg_costume', name: costume.name, message: `已添加造型「${costume.name}」`};
};

export const executeAgentActions = async (vm, actions) => {
    const list = Array.isArray(actions) ? actions : [];
    if (!vm || !vm.editingTarget) throw new Error('编辑器尚未准备好');
    if (!list.length) throw new Error('没有可执行的操作');
    const results = [];
    const preparative = list.filter(action => (
        action.type === 'create_variable' || action.type === 'create_broadcast'
    ));
    for (const action of preparative) {
        try {
            const result = action.type === 'create_variable' ?
                createAgentVariable(vm, action) : createAgentBroadcast(vm, action);
            results.push({...result, ok: true});
        } catch (error) {
            results.push({type: action.type, ok: false, error: error.message});
        }
    }
    for (const action of list) {
        if (action.type === 'create_variable' || action.type === 'create_broadcast') continue;
        try {
            if (action.type === 'insert_xml') {
                const count = applyScratchXml(vm, action.xml);
                results.push({type: 'insert_xml', ok: true, count, message: `已插入 ${count} 个积木`});
            } else if (action.type === 'create_svg_costume') {
                const result = await createAgentSvgCostume(vm, action);
                results.push({...result, ok: true});
            } else {
                throw new Error('不支持的操作类型');
            }
        } catch (error) {
            results.push({type: action.type, ok: false, error: error.message});
        }
    }
    if (results.some(result => result.type === 'insert_xml' && result.ok) &&
        vm.runtime && typeof vm.runtime.emitProjectChanged === 'function') {
        vm.runtime.emitProjectChanged();
    }
    const failed = results.filter(result => !result.ok);
    return {
        ok: failed.length === 0,
        results,
        summary: results.map(result => result.ok ? result.message : `失败：${result.error}`).join('；')
    };
};

export const buildPeAgentSystemPrompt = (vm, searchContext, permission = 'confirm') => {
    const context = buildPeAgentContext(vm);
    const search = searchContext ? `\n联网检索资料：\n${searchContext}\n` : '';
    const permissionRule = permission === 'readonly' ?
        '当前是只读建议模式：不要输出 agent、xml 或 svg 代码块，也不要声称已经修改项目；只给出步骤、思路或示例文字。' :
        (permission === 'full' ?
            '当前是完全权限模式：可以直接输出可执行操作，客户端会在回答结束后自动执行。' :
            '当前是确认模式：可以输出可执行操作，客户端会先展示摘要，等待用户点击执行。');
    return `你是 PEAgent，PointerEditor（Scratch 兼容编辑器）的积木编程助手。你要帮助用户用自然语言完成当前角色的 Scratch 项目。

${context}
${search}

${permissionRule}

你可以使用这些输出方式：
1. 直接用中文解释思路，支持 Markdown（标题、列表、粗体、代码、链接）。
2. 需要插入 Scratch 积木时，输出一个语言标记为 xml 的代码块，内容是合法的 Scratch 3 Blockly XML，包含 <xml>...</xml>。
3. 需要创建变量或广播时，输出一个语言标记为 agent 的 JSON 代码块：
{
  "actions": [
    {"action": "create_variable", "name": "分数", "scope": "global"},
    {"action": "create_broadcast", "name": "开始游戏"}
  ]
}
scope 可以是 global（舞台全局变量）或 local（当前角色变量）。变量和广播会在插入积木前自动创建。
4. 需要绘制角色造型时，输出一个语言标记为 svg 的代码块，内容必须是安全、纯矢量的 SVG，包含 width、height 和 viewBox；可以在开头用 <!-- name: 小猫 --> 指定造型名。不要包含 script、foreignObject、事件属性或外部图片链接。
5. 需要引用刚创建的变量/广播时，把 XML 放在 agent 动作之后的 xml 代码块中。也可以使用 {"action":"insert_scratch_code","xml":"..."} 插入 Scratch 积木，但这只接受 Blockly XML，绝不执行任意 JavaScript。

规则：
1. 先用简短中文说明你的思路，不要输出无关的长篇理论。
2. XML 只能使用 Scratch 3 Blockly 真实积木类型；不要编造积木类型。变量积木必须使用 data_setvariableto / data_changevariableby，不能使用 variables_set / variables_change。积木块可以包含 next、value、shadow、field、x、y。
3. 生成的是追加脚本，不要删除用户已有积木。尽量把新脚本放在空白位置，并保持积木顺序正确。
4. 不要输出 <category>、<sep>、<button> 等工具箱结构，只输出可插入工作区的积木。
5. 需要新变量或广播时直接使用 agent 动作创建，不要只让用户手动去面板创建；变量名和广播名要简短、无换行。
6. 如果问题不需要写代码，直接给出清晰的操作步骤即可。
7. SVG 造型要适合 Scratch 角色：简洁、居中、透明背景、使用明确的填充色和描边，避免过于复杂的滤镜和超大路径。
8. 项目上下文是编辑器实时生成的结构化快照；只使用其中出现的角色、变量、广播和积木类型。上下文标注“已截断”时，不要假设未列出的内容不存在，先向用户确认。
9. 你只能修改当前编辑角色（上下文中的【当前编辑】）；其他角色只用于理解项目。用户要求修改其他角色时，先提示用户切换角色。
10. 修改前先用一句话说明会影响哪些角色和脚本；用户没有提到的部分不要顺手改。
11. 如果用户消息附带舞台截图，把截图当作当前舞台画面；截图与脚本冲突时，先指出可能的运行状态差异，不要假设截图之外的角色或界面。`;
};
export {AGENT_DEFAULTS};
