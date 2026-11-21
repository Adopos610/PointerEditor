import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

import {
    AGENT_DEFAULTS,
    PEAGENT_EFFORTS,
    PEAGENT_FORMATS,
    PEAGENT_PROVIDERS,
    buildPeAgentSystemPrompt,
    cancelPeAgentChat,
    clearPeAgentConfig,
    createPeAgentSession,
    derivePeAgentSessionTitle,
    describeAgentAction,
    executeAgentActions,
    getActivePeAgentSessionId,
    getPeAgentConfig,
    getPeAgentProvider,
    isPeAgentAvailable,
    loadPeAgentSessions,
    parseAgentActions,
    peagentChat,
    peagentChatStream,
    peagentSearch,
    savePeAgentConfig,
    savePeAgentSessions,
    setActivePeAgentSessionId
} from '../../lib/pointer-peagent';
import {selectedBlockPayload} from '../../lib/pointer-cross-window';
import {buildProjectContext} from '../../lib/pointer-agent-context';
import {captureStageImage, getImageMime, readImageFile} from '../../lib/pointer-agent-image';
import downloadBlob from '../../lib/download-blob';
import PointerMarkdown from './pointer-markdown.jsx';
import styles from './pointer-peagent.css';

const PERMISSION_OPTIONS = [
    {value: 'confirm', label: '操作前确认（推荐）'},
    {value: 'full', label: '完全权限（自动执行）'},
    {value: 'readonly', label: '只读建议（不修改项目）'}
];

const QUICK_PROMPTS = [
    '做一个接苹果小游戏，用变量记录分数',
    '画一只蓝色的小猫角色',
    '让角色按下空格键就跳起来'
];

const initialSessionState = () => {
    const sessions = loadPeAgentSessions();
    const activeId = getActivePeAgentSessionId();
    let active = sessions.find(session => session.id === activeId);
    if (!active) active = sessions[0];
    if (!active) {
        active = createPeAgentSession();
        sessions.unshift(active);
        savePeAgentSessions(sessions);
    }
    setActivePeAgentSessionId(active.id);
    return {
        sessions,
        sessionId: active.id,
        messages: active.messages.slice()
    };
};

const formatHistoryTime = value => {
    if (!value) return '';
    try {
        const date = new Date(value);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
        return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch (error) {
        return '';
    }
};

const summarizeActions = actions => actions.map(action => describeAgentAction(action)).join('、');

class PointerPeAgent extends React.Component {
    constructor (props) {
        super(props);
        const sessionState = initialSessionState();
        this.state = {
            phase: 'loading',
            settingsOpen: false,
            config: {...AGENT_DEFAULTS, hasKey: false},
            apiKey: '',
            provider: AGENT_DEFAULTS.provider,
            apiFormat: AGENT_DEFAULTS.apiFormat,
            baseUrl: AGENT_DEFAULTS.baseUrl,
            model: AGENT_DEFAULTS.model,
            temperature: String(AGENT_DEFAULTS.temperature),
            maxTokens: String(AGENT_DEFAULTS.maxTokens),
            deepThink: AGENT_DEFAULTS.thinking,
            reasoningEffort: AGENT_DEFAULTS.reasoningEffort,
            permission: AGENT_DEFAULTS.permission,
            webSearch: false,
            attachStage: false,
            ...sessionState,
            input: '',
            attachments: [],
            modelMenuOpen: false,
            busy: false,
            executing: false,
            error: '',
            searchInfo: '',
            applyResult: null,
            minimized: false,
            pendingApproval: null,
            runNotice: '',
            contextPreview: ''
        };
        this.requestSeq = 0;
        this.activeRequestId = null;
        this.streamText = {content: '', reasoning: ''};
        this.flushTimer = null;
        this.noticeTimer = null;
        this.sending = false;
        this.lastRequestIncludedImages = false;
        this.handleSend = this.handleSend.bind(this);
        this.handleSaveSettings = this.handleSaveSettings.bind(this);
        this.handleNewChat = this.handleNewChat.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleProviderChange = this.handleProviderChange.bind(this);
        this.handleFormatChange = this.handleFormatChange.bind(this);
        this.handleMinimize = this.handleMinimize.bind(this);
        this.handleRestore = this.handleRestore.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleContextPreview = this.handleContextPreview.bind(this);
        this.handleCancelRun = this.handleCancelRun.bind(this);
        this.handleExecuteActions = this.handleExecuteActions.bind(this);
        this.handleSelectSession = this.handleSelectSession.bind(this);
        this.handleDeleteSession = this.handleDeleteSession.bind(this);
        this.handleSelectModel = this.handleSelectModel.bind(this);
        this.handleExportSession = this.handleExportSession.bind(this);
        this.handleAttachBlocks = this.handleAttachBlocks.bind(this);
        this.handleAttachFile = this.handleAttachFile.bind(this);
        this.handleFileChange = this.handleFileChange.bind(this);
        this.scrollToEnd = this.scrollToEnd.bind(this);
        this.persistSession = this.persistSession.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        getPeAgentConfig()
            .then(config => {
                if (!this.mounted) return;
                this.setState({
                    phase: config.hasKey ? 'chat' : 'setup',
                    config,
                    provider: config.provider || AGENT_DEFAULTS.provider,
                    apiFormat: config.apiFormat || AGENT_DEFAULTS.apiFormat,
                    baseUrl: config.baseUrl || AGENT_DEFAULTS.baseUrl,
                    model: config.model || AGENT_DEFAULTS.model,
                    temperature: String(config.temperature || AGENT_DEFAULTS.temperature),
                    maxTokens: String(config.maxTokens || AGENT_DEFAULTS.maxTokens),
                    deepThink: config.thinking !== false,
                    reasoningEffort: config.reasoningEffort || AGENT_DEFAULTS.reasoningEffort,
                    permission: config.permission || AGENT_DEFAULTS.permission,
                    error: config.unavailable ? 'PEAgent 仅桌面版支持本地 API Key 调用' : ''
                });
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({phase: 'setup', error: error.message});
            });
    }

    componentWillUnmount () {
        this.mounted = false;
        clearTimeout(this.flushTimer);
        clearTimeout(this.noticeTimer);
        if (this.activeRequestId) {
            cancelPeAgentChat(this.activeRequestId).catch(() => {});
        }
        const title = derivePeAgentSessionTitle(this.state.messages);
        const current = this.state.sessions.find(item => item.id === this.state.sessionId) || {};
        const sessions = [{
            id: this.state.sessionId,
            title,
            createdAt: current.createdAt || Date.now(),
            updatedAt: Date.now(),
            messages: this.state.messages
        }, ...this.state.sessions.filter(item => item.id !== this.state.sessionId)].slice(0, 30);
        savePeAgentSessions(sessions);
        setActivePeAgentSessionId(this.state.sessionId);
    }

    setRunNotice (notice, duration = 4200) {
        clearTimeout(this.noticeTimer);
        this.setState({runNotice: notice});
        if (notice && duration > 0) {
            this.noticeTimer = setTimeout(() => {
                if (this.mounted) this.setState({runNotice: ''});
            }, duration);
        }
    }

    scrollToEnd () {
        if (this.messagesEnd) this.messagesEnd.scrollIntoView({behavior: 'smooth', block: 'end'});
    }

    persistSession (messages = this.state.messages) {
        if (!this.state.sessionId) return;
        const title = derivePeAgentSessionTitle(messages);
        const current = this.state.sessions.find(item => item.id === this.state.sessionId) || {};
        const updated = {
            id: this.state.sessionId,
            title,
            createdAt: current.createdAt || Date.now(),
            updatedAt: Date.now(),
            messages
        };
        const sessions = [updated, ...this.state.sessions.filter(item => item.id !== this.state.sessionId)]
            .slice(0, 30);
        savePeAgentSessions(sessions);
        setActivePeAgentSessionId(this.state.sessionId);
        this.setState({sessions});
    }

    handleProviderChange (event) {
        const provider = getPeAgentProvider(event.target.value);
        const next = {provider: provider.value, error: ''};
        if (!provider.anthropicBaseUrl && this.state.apiFormat === 'anthropic') {
            next.apiFormat = 'openai';
        }
        if (provider.baseUrl) {
            next.baseUrl = next.apiFormat === 'anthropic' && provider.anthropicBaseUrl ?
                provider.anthropicBaseUrl : provider.baseUrl;
            next.model = provider.models.length ? provider.models[0].value : this.state.model;
        }
        this.setState(next);
    }

    handleFormatChange (event) {
        const apiFormat = event.target.value;
        const provider = getPeAgentProvider(this.state.provider);
        const next = {apiFormat, error: ''};
        if (provider.anthropicBaseUrl) {
            next.baseUrl = apiFormat === 'anthropic' ? provider.anthropicBaseUrl : provider.baseUrl;
        }
        this.setState(next);
    }

    handleSaveSettings (event) {
        event.preventDefault();
        const {
            config, apiKey, provider, apiFormat, baseUrl, model,
            temperature, maxTokens, deepThink, reasoningEffort, permission
        } = this.state;
        if (!config.hasKey && !apiKey.trim()) {
            this.setState({error: '请填写模型 API Key'});
            return;
        }
        if (!baseUrl.trim() || !model.trim()) {
            this.setState({error: '请填写 Base URL 和模型名称'});
            return;
        }
        this.setState({busy: true, error: ''});
        savePeAgentConfig({
            apiKey: apiKey.trim(),
            provider,
            apiFormat,
            baseUrl: baseUrl.trim(),
            model: model.trim(),
            temperature: Number(temperature),
            maxTokens: Number(maxTokens),
            thinking: deepThink,
            reasoningEffort,
            permission
        })
            .then(next => {
                if (!this.mounted) return;
                this.setState({
                    config: next,
                    phase: 'chat',
                    settingsOpen: false,
                    apiKey: '',
                    busy: false
                }, () => this.scrollToEnd());
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({busy: false, error: error.message});
            });
    }

    handleKeyDown (event) {
        if (event.nativeEvent && event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSend();
        }
    }

    handleNewChat () {
        if (this.state.busy) this.handleCancelRun();
        const session = createPeAgentSession();
        const sessions = [session, ...this.state.sessions].slice(0, 30);
        savePeAgentSessions(sessions);
        setActivePeAgentSessionId(session.id);
        this.setState({
            sessions,
            sessionId: session.id,
            messages: session.messages,
            input: '',
            attachments: [],
            error: '',
            searchInfo: '',
            applyResult: null,
            pendingApproval: null,
            minimized: false,
            runNotice: ''
        });
    }

    handleSelectSession (sessionId) {
        if (sessionId === this.state.sessionId) return;
        if (this.state.busy) this.handleCancelRun();
        const session = this.state.sessions.find(item => item.id === sessionId);
        if (!session) return;
        setActivePeAgentSessionId(session.id);
        this.setState({
            sessionId: session.id,
            messages: session.messages.slice(),
            input: '',
            attachments: [],
            error: '',
            searchInfo: '',
            applyResult: null,
            pendingApproval: null,
            minimized: false,
            runNotice: ''
        });
    }

    handleDeleteSession (sessionId, event) {
        event.stopPropagation();
        if (this.state.busy && sessionId === this.state.sessionId) this.handleCancelRun();
        let sessions = this.state.sessions.filter(item => item.id !== sessionId);
        if (!sessions.length) sessions = [createPeAgentSession()];
        const active = sessions.find(item => item.id === this.state.sessionId) || sessions[0];
        savePeAgentSessions(sessions);
        setActivePeAgentSessionId(active.id);
        this.setState({
            sessions,
            sessionId: active.id,
            messages: active.messages.slice(),
            applyResult: null,
            pendingApproval: null
        });
    }

    handleSelectModel (modelValue) {
        let provider = getPeAgentProvider(this.state.provider);
        let found = provider.models.find(item => item.value === modelValue);
        if (!found) {
            for (const candidate of PEAGENT_PROVIDERS) {
                const match = candidate.models.find(item => item.value === modelValue);
                if (match) {
                    provider = candidate;
                    found = match;
                    break;
                }
            }
        }
        if (!found) {
            this.setState({modelMenuOpen: false, settingsOpen: true, error: ''});
            return;
        }
        const apiFormat = provider.anthropicBaseUrl && this.state.apiFormat === 'anthropic' ?
            'anthropic' : 'openai';
        const baseUrl = apiFormat === 'anthropic' && provider.anthropicBaseUrl ?
            provider.anthropicBaseUrl : provider.baseUrl;
        this.setState({
            modelMenuOpen: false,
            provider: provider.value,
            apiFormat,
            baseUrl: baseUrl || this.state.baseUrl,
            model: modelValue,
            config: {...this.state.config, model: modelValue, provider: provider.value}
        });
        if (!this.state.config.hasKey) return;
        savePeAgentConfig({
            apiKey: '',
            provider: provider.value,
            apiFormat,
            baseUrl: baseUrl || this.state.baseUrl,
            model: modelValue,
            temperature: Number(this.state.temperature),
            maxTokens: Number(this.state.maxTokens),
            thinking: this.state.deepThink,
            reasoningEffort: this.state.reasoningEffort,
            permission: this.state.permission
        })
            .then(next => {
                if (this.mounted) this.setState({config: next});
            })
            .catch(() => {});
    }

    handleExportSession () {
        const title = derivePeAgentSessionTitle(this.state.messages) || 'PEAgent 会话';
        const lines = [`# ${title}`, '', `导出时间：${new Date().toLocaleString()}`, ''];
        this.state.messages.forEach(message => {
            if (message.role === 'system') return;
            lines.push(message.role === 'user' ? '## 你' : '## PEAgent', '');
            if (message.reasoning) lines.push('> 思考过程：', message.reasoning, '');
            lines.push(message.content || '', '');
        });
        downloadBlob(`${title}.md`, new Blob([lines.join('\n')], {type: 'text/markdown;charset=utf-8'}));
        this.setRunNotice('会话已导出为 Markdown');
    }

    addAttachment (attachment) {
        if (attachment.kind === 'image') {
            const imageCount = this.state.attachments.filter(item => item.kind === 'image').length;
            if (imageCount >= 2) {
                this.setRunNotice('最多附加 2 张图片');
                return false;
            }
        }
        this.setState(previous => ({
            attachments: previous.attachments.concat({
                ...attachment,
                id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
            })
        }));
        return true;
    }

    removeAttachment (id) {
        this.setState(previous => ({
            attachments: previous.attachments.filter(item => item.id !== id)
        }));
    }

    handleAttachBlocks () {
        selectedBlockPayload()
            .then(payload => {
                this.addAttachment({name: `积木 · ${payload.name}`, content: payload.xml, kind: 'blocks'});
                this.setRunNotice('已把选中积木加入上下文');
            })
            .catch(error => this.setRunNotice(error.message || '请先在积木区选中一段积木'));
    }

    handleAttachFile () {
        if (this.fileInput) this.fileInput.click();
    }

    handleFileChange (event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        if (/^image\//i.test(file.type || '')) {
            readImageFile(file)
                .then(dataUrl => {
                    const mime = getImageMime(dataUrl) || 'image/jpeg';
                    if (this.addAttachment({name: file.name, kind: 'image', dataUrl, mime})) {
                        this.setRunNotice(`已附加图片 ${file.name}`);
                    }
                })
                .catch(error => this.setRunNotice(error.message || '无法读取图片'));
            return;
        }
        if (file.size > 400000) {
            this.setRunNotice('附件过大，请选择 400KB 以内的文本/代码文件');
            return;
        }
        file.text()
            .then(text => {
                this.addAttachment({name: file.name, content: text.slice(0, 20000), kind: 'file'});
                this.setRunNotice(`已附加 ${file.name}`);
            })
            .catch(() => this.setRunNotice('无法读取该文件'));
    }

    handleMinimize () {
        this.setState({minimized: true, modelMenuOpen: false});
    }

    handleRestore () {
        this.setState({minimized: false, runNotice: ''});
    }

    handleClose () {
        if (this.state.busy) {
            this.setState({minimized: true});
            return;
        }
        this.props.onClose();
    }

    handleContextPreview () {
        let preview = '';
        try {
            preview = buildProjectContext(this.props.vm);
        } catch (error) {
            preview = `生成项目上下文失败：${error.message}`;
        }
        this.setState({contextPreview: preview});
    }

    handleCancelRun () {
        const requestId = this.activeRequestId;
        this.requestSeq += 1;
        this.activeRequestId = null;
        clearTimeout(this.flushTimer);
        if (requestId) cancelPeAgentChat(requestId).catch(() => {});
        this.setState(previous => {
            const messages = previous.messages.slice();
            const last = messages.length - 1;
            if (last >= 0 && messages[last].role === 'assistant' && messages[last].streaming) {
                messages[last] = {
                    ...messages[last],
                    streaming: false,
                    cancelled: true,
                    content: messages[last].content || '（本次生成已取消）'
                };
            }
            return {
                messages,
                busy: false,
                pendingApproval: null,
                runNotice: '已取消本次生成'
            };
        }, () => this.persistSession());
    }

    async handleSend () {
        const text = this.state.input.trim();
        const attachments = this.state.attachments;
        const attachStage = this.state.attachStage;
        if ((!text && !attachments.length && !attachStage) ||
            this.state.busy || this.state.phase !== 'chat' || this.sending) return;
        this.sending = true;
        let stageImage = null;
        let stageNotice = '';
        if (attachStage) {
            this.setRunNotice('正在获取舞台画面…', 0);
            try {
                stageImage = await captureStageImage(this.props.vm);
            } catch (error) {
                stageImage = null;
            }
            if (!this.mounted) {
                this.sending = false;
                return;
            }
            if (!stageImage) stageNotice = '未能获取舞台画面，本次仅发送文字';
        }
        const textAttachments = attachments.filter(item => item.kind !== 'image');
        const imageAttachments = attachments.filter(item => item.kind === 'image').slice(0, 2);
        if (stageImage && imageAttachments.length < 2) {
            imageAttachments.push({name: '舞台画面', kind: 'image', dataUrl: stageImage});
        } else if (stageImage) {
            stageNotice = '已附加 2 张图片，舞台画面未加入';
        }
        if (!text && !textAttachments.length && !imageAttachments.length) {
            this.sending = false;
            return;
        }
        const attachmentText = textAttachments.map(item => `\n\n[附件：${item.name}]\n${item.content}`).join('');
        const queryText = (text || '请结合附件内容处理。') + attachmentText;
        const userContent = imageAttachments.length ? [
            {type: 'text', text: queryText},
            ...imageAttachments.map(item => ({type: 'image', dataUrl: item.dataUrl}))
        ] : queryText;
        const history = this.state.messages
            .filter(message => message.role !== 'system' && !message.streaming && message.content)
            .slice(-14)
            .map(message => ({
                role: message.role,
                content: message.context ? message.content + message.context : message.content
            }));
        const userMessage = {
            role: 'user',
            content: text || (imageAttachments.length ? '（图片）' : '（附件）'),
            context: attachmentText,
            attachments: attachments.map(item => ({name: item.name, kind: item.kind}))
                .concat(stageImage ? [{name: '舞台画面', kind: 'image'}] : [])
        };
        const assistantIndex = this.state.messages.length + 1;
        const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const placeholder = {role: 'assistant', content: '', reasoning: '', streaming: true};
        this.streamText = {content: '', reasoning: ''};
        this.activeRequestId = requestId;
        this.setState(previous => ({
            messages: previous.messages.concat(userMessage, placeholder),
            input: '',
            attachments: [],
            busy: true,
            error: '',
            searchInfo: '',
            applyResult: null,
            pendingApproval: null,
            runNotice: stageNotice
        }), () => {
            this.sending = false;
            this.persistSession();
            this.scrollToEnd();
            this.runAgent(
                history.concat({role: 'user', content: userContent}),
                queryText,
                assistantIndex,
                requestId,
                imageAttachments.length > 0
            );
        });
    }

    runAgent (history, userContent, searchText, assistantIndex, requestId, includesImages) {
        const generation = ++this.requestSeq;
        const {
            config, deepThink, reasoningEffort, webSearch, temperature, maxTokens, permission
        } = this.state;
        this.lastRequestIncludedImages = Boolean(includesImages);
        const searchStep = webSearch ? peagentSearch(searchText) : Promise.resolve(null);
        searchStep
            .then(search => {
                if (!this.mounted || generation !== this.requestSeq) return null;
                let searchContext = '';
                if (search) {
                    if (search.ok) {
                        searchContext = search.results.map((item, index) => (
                            `${index + 1}. ${item.title}\n${item.snippet}\n${item.url}`
                        )).join('\n\n');
                        this.setState({searchInfo: `已联网检索 ${search.results.length} 条资料`});
                    } else {
                        this.setState({searchInfo: `联网搜索未完成：${search.error}`});
                    }
                }
                const system = buildPeAgentSystemPrompt(this.props.vm, searchContext, permission);
                const messages = [{role: 'system', content: system}].concat(
                    history,
                    {role: 'user', content: userContent}
                );
                const payload = {
                    messages,
                    model: config.model,
                    thinking: deepThink,
                    reasoningEffort,
                    temperature: Number(temperature),
                    maxTokens: Number(maxTokens)
                };
                const canStream = typeof window !== 'undefined' && window.pointerAgent &&
                    typeof window.pointerAgent.chatStream === 'function';
                if (!canStream) return peagentChat(payload);
                return peagentChatStream({...payload, requestId}, event => {
                    this.handleStreamEvent(generation, event, assistantIndex);
                });
            })
            .then(result => {
                if (!this.mounted || generation !== this.requestSeq || !result) return;
                this.handleAgentResult(result, assistantIndex);
            })
            .catch(error => {
                if (!this.mounted || generation !== this.requestSeq) return;
                this.finishWithError(error);
            });
    }

    handleStreamEvent (generation, event, assistantIndex) {
        if (!this.mounted || generation !== this.requestSeq || !event) return;
        if (event.type === 'delta') {
            this.streamText.content += event.text || '';
            this.scheduleStreamFlush(assistantIndex);
        } else if (event.type === 'reasoning') {
            this.streamText.reasoning += event.text || '';
            this.scheduleStreamFlush(assistantIndex);
        } else if (event.type === 'notice' && event.text) {
            this.setRunNotice(event.text, 7000);
        }
    }

    scheduleStreamFlush (assistantIndex) {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            if (!this.mounted) return;
            const {content, reasoning} = this.streamText;
            this.setState(previous => ({
                messages: previous.messages.map((message, index) => (
                    index === assistantIndex ?
                        {...message, content, reasoning, streaming: true} : message
                ))
            }), () => this.scrollToEnd());
        }, 45);
    }

    finishWithError (error) {
        clearTimeout(this.flushTimer);
        this.activeRequestId = null;
        const message = error && error.message ? error.message : '请求失败';
        const imageHint = this.lastRequestIncludedImages &&
            /image|vision|multimodal|input_image|image_url|图片|视觉|content.*type|type.*content|invalid|unsupported|bad request|400/i.test(message) ?
            '。当前模型可能不支持图片输入，请关闭「舞台画面」或换用支持视觉的模型' : '';
        this.lastRequestIncludedImages = false;
        const display = `${message}${imageHint}`;
        this.setState(previous => {
            const messages = previous.messages.slice();
            const last = messages.length - 1;
            if (last >= 0 && messages[last].role === 'assistant') {
                messages[last] = {
                    ...messages[last],
                    streaming: false,
                    content: messages[last].content || `（请求失败：${display}）`
                };
            }
            return {messages, busy: false, error: display, executing: false};
        }, () => this.persistSession());
    }

    handleAgentResult (result, assistantIndex) {
        clearTimeout(this.flushTimer);
        this.activeRequestId = null;
        if (!result.ok) {
            if (result.cancelled) return;
            this.finishWithError(new Error(result.error || 'PEAgent 请求失败'));
            return;
        }
        this.lastRequestIncludedImages = false;
        const content = result.content || this.streamText.content;
        const reasoning = result.reasoning || this.streamText.reasoning;
        this.setState(previous => ({
            messages: previous.messages.map((message, index) => (
                index === assistantIndex ?
                    {...message, content, reasoning, streaming: false} : message
            )),
            busy: false,
            error: ''
        }), () => {
            this.persistSession();
            const actions = parseAgentActions(content);
            if (!actions.length) {
                if (this.state.minimized) this.setRunNotice('回答已完成');
                return;
            }
            if (this.state.permission === 'full') {
                this.setRunNotice('完全权限：正在自动执行操作…', 0);
                this.handleExecuteActions(assistantIndex, actions);
            } else if (this.state.permission === 'confirm' && this.state.minimized) {
                this.setState({pendingApproval: {messageIndex: assistantIndex, actions}});
            }
        });
    }

    handleExecuteActions (messageIndex, providedActions) {
        if (this.state.executing) return;
        const actions = providedActions ||
            parseAgentActions((this.state.messages[messageIndex] || {}).content);
        if (!actions || !actions.length) return;
        if (this.state.permission === 'readonly') {
            this.setState({applyResult: {index: messageIndex, error: '当前是只读建议模式，未执行操作'}});
            return;
        }
        this.setState({
            executing: true,
            pendingApproval: null,
            applyResult: {index: messageIndex, running: true},
            error: ''
        });
        executeAgentActions(this.props.vm, actions)
            .then(result => {
                if (!this.mounted) return;
                this.setState({
                    executing: false,
                    applyResult: {
                        index: messageIndex,
                        success: result.summary,
                        ok: result.ok
                    }
                }, () => this.persistSession());
                this.setRunNotice(result.ok ? '操作已全部完成' : '部分操作未完成');
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({
                    executing: false,
                    applyResult: {index: messageIndex, error: error.message}
                });
            });
    }

    handleDismissApproval () {
        this.setState({pendingApproval: null});
        this.setRunNotice('已忽略这次操作');
    }

    renderSidebar () {
        const sessions = this.state.sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
        const providerInfo = getPeAgentProvider(this.state.provider);
        return (
            <aside className={styles.sidebar}>
                <div className={styles.sidebarBrand}>
                    <div className={styles.brandText}>
                        <strong>PEAgent</strong>
                        <span>项目会话</span>
                    </div>
                </div>
                <button type="button" className={styles.newChat} onClick={this.handleNewChat}>
                    <span>＋</span> 新对话
                </button>
                <div className={styles.sidebarLabel}>最近</div>
                <ul className={styles.sessionList}>
                    {sessions.map(session => (
                        <li
                            key={session.id}
                            className={session.id === this.state.sessionId ?
                                styles.sessionItemActive : styles.sessionItem}
                            onClick={() => this.handleSelectSession(session.id)}
                        >
                            <div className={styles.sessionMain}>
                                <strong>{session.title}</strong>
                                <span>
                                    {formatHistoryTime(session.updatedAt)} · {session.messages.length} 条
                                </span>
                            </div>
                            <button
                                type="button"
                                className={styles.sessionDelete}
                                onClick={event => this.handleDeleteSession(session.id, event)}
                                aria-label="删除会话"
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
                <div className={styles.sidebarFoot}>
                    <span className={styles.footProvider}>
                        <em>{providerInfo.icon}</em>
                        {providerInfo.label}
                    </span>
                    <span className={styles.footTag}>
                        {this.state.permission === 'full' ? '完全权限' :
                            (this.state.permission === 'readonly' ? '只读' : '确认模式')}
                    </span>
                </div>
            </aside>
        );
    }

    renderModelPicker () {
        const {model, modelMenuOpen, config} = this.state;
        const current = config.model || model;
        return (
            <div className={styles.modelPicker}>
                <button
                    type="button"
                    className={styles.modelButton}
                    onClick={() => this.setState(previous => ({modelMenuOpen: !previous.modelMenuOpen}))}
                    aria-expanded={modelMenuOpen}
                >
                    {current}
                    <span className={styles.modelCaret}>⌄</span>
                </button>
                {modelMenuOpen ? (
                    <div className={styles.modelMenu}>
                        {PEAGENT_PROVIDERS.filter(provider => provider.models.length).map(provider => (
                            <div key={provider.value} className={styles.modelGroup}>
                                <div className={styles.modelGroupLabel}>{provider.label}</div>
                                {provider.models.map(item => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className={item.value === current ?
                                            styles.modelRowActive : styles.modelRow}
                                        onClick={() => this.handleSelectModel(item.value)}
                                    >
                                        <span className={styles.modelIcon}>{provider.icon}</span>
                                        <span className={styles.modelLabel}>{item.value}</span>
                                        {item.value === current ? <span className={styles.modelCheck}>✓</span> : null}
                                    </button>
                                ))}
                            </div>
                        ))}
                        <button
                            type="button"
                            className={styles.modelCustom}
                            onClick={() => this.setState({modelMenuOpen: false, settingsOpen: true, error: ''})}
                        >
                            自定义模型 / 接口设置…
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }

    renderActionCard (message, index) {
        if (message.streaming) return null;
        const actions = parseAgentActions(message.content);
        if (!actions.length) return null;
        const result = this.state.applyResult && this.state.applyResult.index === index ?
            this.state.applyResult : null;
        const permission = this.state.permission;
        return (
            <div className={styles.actionCard}>
                <div className={styles.actionHead}>
                    <span>Agent 操作</span>
                    <em>{actions.length} 项</em>
                </div>
                <ul>
                    {actions.map((action, actionIndex) => (
                        <li key={`${action.type}-${actionIndex}`}>
                            <span>✦</span>
                            {describeAgentAction(action)}
                        </li>
                    ))}
                </ul>
                {permission === 'readonly' ? (
                    <p className={styles.actionNotice}>只读建议模式：以上操作不会执行。</p>
                ) : (
                    <React.Fragment>
                        {result && result.running ? <p className={styles.actionNotice}>正在执行…</p> : null}
                        {result && result.success ? (
                            <p className={result.ok === false ? styles.actionError : styles.actionSuccess}>
                                {result.success}
                            </p>
                        ) : null}
                        {result && result.error ? <p className={styles.actionError}>{result.error}</p> : null}
                        {!result && permission === 'full' ? (
                            <p className={styles.actionNotice}>完全权限模式：回答结束后自动执行。</p>
                        ) : null}
                        {(!result && permission !== 'full') || (result && result.error) ? (
                            <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() => this.handleExecuteActions(index)}
                                disabled={this.state.executing}
                            >
                                {this.state.executing ? '正在执行…' : '执行这些操作'}
                            </button>
                        ) : null}
                    </React.Fragment>
                )}
            </div>
        );
    }

    renderAssistantMessage (message, index) {
        return (
            <div key={`assistant-${index}`} className={styles.assistantMessage}>
                <div className={styles.messageMeta}>
                    <span className={styles.metaAvatar}>✦</span>
                    PEAgent
                </div>
                {message.reasoning ? (
                    <details className={styles.reasoning}>
                        <summary>深度思考过程</summary>
                        <div>{message.reasoning}</div>
                    </details>
                ) : null}
                {message.content ? (
                    <PointerMarkdown content={message.content} />
                ) : (
                    message.streaming ? <span className={styles.streamingHint}>正在思考…</span> : null
                )}
                {message.streaming ? <span className={styles.streamingCursor}>▍</span> : null}
                {this.renderActionCard(message, index)}
            </div>
        );
    }

    renderWelcome () {
        return (
            <div className={styles.welcome}>
                <span className={styles.welcomeChip}>PEAgent</span>
                <h2>把问题、需求或代码片段<br />直接发进来</h2>
                <p>可以让它解释积木逻辑、整理上下文、分析附件，或者直接帮助你修改当前工作区内容。</p>
                <div className={styles.welcomePrompts}>
                    {QUICK_PROMPTS.map(prompt => (
                        <button
                            key={prompt}
                            type="button"
                            className={styles.welcomePrompt}
                            onClick={() => this.setState({input: prompt})}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    renderSettings () {
        const {
            config, apiKey, provider, apiFormat, baseUrl, model,
            temperature, maxTokens, deepThink, reasoningEffort, permission,
            busy, error, phase, settingsOpen
        } = this.state;
        const onboarding = phase === 'setup';
        const providerInfo = getPeAgentProvider(provider);
        return (
            <div className={styles.settings}>
                {!settingsOpen ? (
                    <div className={styles.setupIntro}>
                        <h2>PEAgent</h2>
                        <p>用自然语言生成积木、创建变量和广播、绘制 SVG 造型。已预填 DeepSeek V4 参数，也能接入其他兼容模型。</p>
                    </div>
                ) : (
                    <div className={styles.settingsHead}>
                        <button type="button" className={styles.linkButton} onClick={() => this.setState({settingsOpen: false, error: ''})}>
                            ← 返回对话
                        </button>
                    </div>
                )}
                <div className={styles.providerCard}>
                    <span className={styles.providerIcon}>{providerInfo.icon}</span>
                    <div>
                        <strong>{providerInfo.label}</strong>
                        <p>
                            {provider === 'deepseek' ?
                                '已预填 deepseek-flash / deepseek-v4-pro 与 1M 上下文参数；思考模式默认开启。' :
                                '支持任何 OpenAI Chat Completions 兼容接口，也可切换到 Anthropic 兼容格式。'}
                        </p>
                    </div>
                    <span className={styles.providerTag}>{provider === 'deepseek' ? '参数预置' : '可接入'}</span>
                </div>
                <details className={styles.contextPreview}>
                    <summary onClick={this.handleContextPreview}>查看当前项目上下文</summary>
                    <pre className={styles.contextPre}>{this.state.contextPreview || '展开后生成…'}</pre>
                </details>
                <form className={styles.settingsForm} onSubmit={this.handleSaveSettings}>
                    <div className={styles.advancedGrid}>
                        <label className={styles.field}>
                            <span>模型服务商</span>
                            <select value={provider} onChange={this.handleProviderChange}>
                                {PEAGENT_PROVIDERS.map(item => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span>接口格式</span>
                            <select value={apiFormat} onChange={this.handleFormatChange}>
                                {PEAGENT_FORMATS.map(item => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className={styles.field}>
                        <span>{provider === 'custom' ? 'API Key' : `${providerInfo.label} API Key`}</span>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={e => this.setState({apiKey: e.target.value})}
                            placeholder={config.hasKey ? '已保存，留空则保持不变' : 'sk-...'}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </label>
                    <div className={styles.keyHint}>
                        <span>Key 只保存在本机，由系统密钥加密；请求直接发送到你填写的接口，不经过 PointerE 服务器。</span>
                        {providerInfo.keyUrl ? (
                            <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => window.open(providerInfo.keyUrl, '_blank', 'noopener')}
                            >
                                获取 API Key
                            </button>
                        ) : null}
                    </div>
                    <label className={styles.field}>
                        <span>API Base URL</span>
                        <input
                            value={baseUrl}
                            onChange={e => this.setState({baseUrl: e.target.value})}
                            placeholder="https://api.example.com/v1"
                            spellCheck={false}
                        />
                    </label>
                    <label className={styles.field}>
                        <span>模型名称</span>
                        <input
                            value={model}
                            onChange={e => this.setState({model: e.target.value})}
                            list="peagent-model-options"
                            placeholder={provider === 'deepseek' ? 'deepseek-flash' : '模型 ID'}
                            spellCheck={false}
                        />
                        <datalist id="peagent-model-options">
                            {providerInfo.models.map(item => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </datalist>
                    </label>
                    {provider === 'deepseek' ? (
                        <p className={styles.modelHint}>
                            deepseek-flash 为 V4.1 Flash（支持图像理解），deepseek-v4-pro 为 V4 Pro；上下文 1M，最大输出 384K。也可直接填写旧版模型名。
                        </p>
                    ) : null}
                    <label className={styles.field}>
                        <span>Agent 权限</span>
                        <select value={permission} onChange={e => this.setState({permission: e.target.value})}>
                            {PERMISSION_OPTIONS.map(item => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>
                    </label>
                    <p className={styles.modelHint}>
                        完全权限会自动创建变量/广播、插入积木和添加 SVG 造型；确认模式会先展示操作摘要；只读模式仅提供建议。Agent 不会执行任意 JavaScript。
                    </p>
                    <details className={styles.advanced}>
                        <summary>高级参数（已预填）</summary>
                        <div className={styles.advancedGrid}>
                            <label className={styles.field}>
                                <span>Temperature</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={temperature}
                                    onChange={e => this.setState({temperature: e.target.value})}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>Max Tokens</span>
                                <input
                                    type="number"
                                    min="128"
                                    max="65536"
                                    step="128"
                                    value={maxTokens}
                                    onChange={e => this.setState({maxTokens: e.target.value})}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>默认思考模式</span>
                                <select
                                    value={deepThink ? 'on' : 'off'}
                                    onChange={e => this.setState({deepThink: e.target.value === 'on'})}
                                >
                                    <option value="on">开启</option>
                                    <option value="off">关闭</option>
                                </select>
                            </label>
                            <label className={styles.field}>
                                <span>思考强度</span>
                                <select
                                    value={reasoningEffort}
                                    onChange={e => this.setState({reasoningEffort: e.target.value})}
                                    disabled={!deepThink}
                                >
                                    {PEAGENT_EFFORTS.map(item => (
                                        <option key={item.value} value={item.value}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className={styles.modelHint}>
                            思考模式下 DeepSeek 会忽略 Temperature；非思考模式仍可调整。Max Tokens 会按接口能力自动限制。
                        </p>
                    </details>
                    {error ? <p className={styles.error}>{error}</p> : null}
                    <div className={styles.settingsActions}>
                        <button type="submit" className={styles.primary} disabled={busy || !isPeAgentAvailable()}>
                            {busy ? '保存中…' : (onboarding ? '保存并开始' : '保存设置')}
                        </button>
                        {!onboarding ? (
                            <button
                                type="button"
                                className={styles.secondary}
                                onClick={() => {
                                    clearPeAgentConfig().then(next => {
                                        if (!this.mounted) return;
                                        this.setState({
                                            config: next,
                                            apiKey: '',
                                            provider: next.provider || AGENT_DEFAULTS.provider,
                                            apiFormat: next.apiFormat || AGENT_DEFAULTS.apiFormat,
                                            baseUrl: next.baseUrl || AGENT_DEFAULTS.baseUrl,
                                            model: next.model || AGENT_DEFAULTS.model,
                                            deepThink: next.thinking !== false,
                                            reasoningEffort: next.reasoningEffort || AGENT_DEFAULTS.reasoningEffort,
                                            permission: next.permission || AGENT_DEFAULTS.permission,
                                            phase: 'setup',
                                            settingsOpen: false,
                                            error: ''
                                        });
                                    }).catch(clearError => this.setState({error: clearError.message}));
                                }}
                            >
                                清除 Key
                            </button>
                        ) : null}
                    </div>
                </form>
            </div>
        );
    }

    renderChat () {
        const {
            messages, input, attachments, busy, deepThink, reasoningEffort, webSearch,
            attachStage, error, searchInfo, runNotice
        } = this.state;
        const hasUser = messages.some(message => message.role === 'user');
        const sessionTitle = derivePeAgentSessionTitle(messages) || '新对话';
        return (
            <section className={styles.main}>
                <header className={styles.mainHeader}>
                    <button
                        type="button"
                        className={styles.collapseBtn}
                        onClick={this.handleMinimize}
                        title="最小化"
                        aria-label="最小化"
                    >
                        ←
                    </button>
                    <div className={styles.mainTitle}>
                        <strong>{sessionTitle}</strong>
                        <span>Scratch 代码 · 实时项目上下文</span>
                    </div>
                    <span className={styles.headerSpacer} />
                    {this.renderModelPicker()}
                    <button type="button" className={styles.headerBtn} onClick={this.handleExportSession}>
                        导出会话
                    </button>
                    <button
                        type="button"
                        className={styles.headerBtn}
                        onClick={() => this.setState({settingsOpen: true, modelMenuOpen: false, error: ''})}
                    >
                        设置
                    </button>
                    <button type="button" className={styles.closeBtn} onClick={this.handleClose} aria-label="关闭">
                        ×
                    </button>
                </header>
                <div className={styles.chatScroll}>
                    {!hasUser ? this.renderWelcome() : null}
                    {messages.map((message, index) => {
                        if (!hasUser && index === 0 && message.role === 'assistant') return null;
                        return message.role === 'user' ? (
                            <div key={`user-${index}`} className={styles.userMessage}>
                                <div className={styles.messageMeta}>你</div>
                                <div className={styles.userText}>{message.content}</div>
                                {message.attachments && message.attachments.length ? (
                                    <div className={styles.attachTags}>
                                        {message.attachments.map((item, i) => (
                                            <span key={`${item.name}-${i}`} className={styles.attachTag}>
                                                {item.kind === 'image' ? '图 · ' : (item.kind === 'blocks' ? '⧉ ' : '📄 ')}
                                                {item.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : this.renderAssistantMessage(message, index);
                    })}
                    {busy ? <div className={styles.thinking}>PEAgent 正在思考…</div> : null}
                    <div ref={node => { this.messagesEnd = node; }} />
                </div>
                {searchInfo ? <p className={styles.searchInfo}>{searchInfo}</p> : null}
                {runNotice ? <p className={styles.noticeLine}>{runNotice}</p> : null}
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.composer}>
                    {attachments.length ? (
                        <div className={styles.attachChips}>
                            {attachments.map(item => (
                                <span key={item.id} className={styles.attachChip}>
                                    {item.kind === 'image' && item.dataUrl ? (
                                        <img className={styles.attachThumb} src={item.dataUrl} alt="" />
                                    ) : (item.kind === 'blocks' ? '⧉ ' : '📄 ')}
                                    {item.name}
                                    <button
                                        type="button"
                                        className={styles.attachRemove}
                                        onClick={() => this.removeAttachment(item.id)}
                                        aria-label="移除附件"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <div className={styles.composerBox}>
                        <textarea
                            value={input}
                            onChange={e => this.setState({input: e.target.value})}
                            onKeyDown={this.handleKeyDown}
                            placeholder="输入消息、修改需求或粘贴上下文…（Enter 发送，Shift+Enter 换行）"
                            rows={2}
                            disabled={busy}
                        />
                        <div className={styles.composerBar}>
                            <button
                                type="button"
                                className={deepThink ? styles.toolBtnActive : styles.toolBtn}
                                onClick={() => this.setState({deepThink: !deepThink})}
                            >
                                思考
                            </button>
                            <button type="button" className={styles.toolBtn} onClick={this.handleAttachBlocks}>
                                选择积木
                            </button>
                            <button type="button" className={styles.toolBtn} onClick={this.handleAttachFile}>
                                添加图片/文件
                            </button>
                            <button
                                type="button"
                                className={attachStage ? styles.toolBtnActive : styles.toolBtn}
                                onClick={() => this.setState(previous => ({attachStage: !previous.attachStage}))}
                                title="把当前舞台画面随消息发送，需要模型支持视觉输入"
                            >
                                舞台画面
                            </button>
                            <button
                                type="button"
                                className={webSearch ? styles.toolBtnActive : styles.toolBtn}
                                onClick={() => this.setState({webSearch: !webSearch})}
                            >
                                网页搜索
                            </button>
                            {deepThink ? (
                                <select
                                    className={styles.effortSelect}
                                    value={reasoningEffort}
                                    onChange={e => this.setState({reasoningEffort: e.target.value})}
                                    title="思考强度"
                                >
                                    {PEAGENT_EFFORTS.map(item => (
                                        <option key={item.value} value={item.value}>{item.value}</option>
                                    ))}
                                </select>
                            ) : null}
                            <span className={styles.barSpacer} />
                            <button
                                type="button"
                                className={styles.sendBtn}
                                onClick={this.handleSend}
                                disabled={busy || (!input.trim() && !attachments.length && !attachStage)}
                                aria-label="发送"
                            >
                                ➤
                            </button>
                        </div>
                    </div>
                    <p className={styles.hint}>
                        Enter 发送 · Shift+Enter 换行 · 操作按「Agent 权限」执行 · 「舞台画面」需要模型支持视觉
                    </p>
                </div>
                <input
                    ref={node => { this.fileInput = node; }}
                    className={styles.fileInput}
                    type="file"
                    accept=".txt,.md,.json,.xml,.js,.jsx,.ts,.css,.html,.csv,.log,image/png,image/jpeg,image/webp"
                    onChange={this.handleFileChange}
                />
            </section>
        );
    }

    renderMinimized () {
        const {busy, minimized, pendingApproval, executing, runNotice, config} = this.state;
        if (!minimized) return null;
        return ReactDOM.createPortal(
            <div className={styles.minWrap}>
                <div className={styles.minPill}>
                    <span className={styles.minIcon}>
                        ✦
                        {busy ? <span className={styles.minPulse} /> : null}
                    </span>
                    <div className={styles.minText}>
                        <strong>
                            {busy ? 'PEAgent 正在运行' :
                                (executing ? '正在应用操作' :
                                    (pendingApproval ? '需要你的确认' : 'PEAgent'))}
                        </strong>
                        <span>
                            {busy ? `使用 ${config.model || '模型'} 生成中…` :
                                (pendingApproval ? summarizeActions(pendingApproval.actions) :
                                    (runNotice || '点击打开对话'))}
                        </span>
                    </div>
                    <div className={styles.minButtons}>
                        {busy ? (
                            <button type="button" className={styles.minCancel} onClick={this.handleCancelRun}>
                                取消
                            </button>
                        ) : null}
                        <button type="button" className={styles.minOpen} onClick={this.handleRestore}>
                            打开
                        </button>
                        {!busy ? (
                            <button type="button" className={styles.minClose} onClick={this.handleClose} aria-label="关闭">
                                ×
                            </button>
                        ) : null}
                    </div>
                </div>
                {pendingApproval ? (
                    <div className={styles.minApproval}>
                        <p>模型请求执行以下操作，是否允许？</p>
                        <ul>
                            {pendingApproval.actions.map((action, index) => (
                                <li key={`${action.type}-${index}`}>{describeAgentAction(action)}</li>
                            ))}
                        </ul>
                        <div className={styles.minApprovalActions}>
                            <button
                                type="button"
                                className={styles.minAllow}
                                onClick={() => this.handleExecuteActions(
                                    pendingApproval.messageIndex,
                                    pendingApproval.actions
                                )}
                            >
                                允许并执行
                            </button>
                            <button type="button" className={styles.minClose} onClick={this.handleDismissApproval}>
                                忽略
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>,
            document.body
        );
    }

    render () {
        const {phase, settingsOpen, minimized} = this.state;
        return (
            <React.Fragment>
                {!minimized ? (
                    <div className={styles.overlay} role="dialog" aria-modal="true">
                        <div className={styles.panel}>
                            {this.renderSidebar()}
                            {phase === 'loading' ? (
                                <div className={styles.loading}>正在读取 PEAgent 配置…</div>
                            ) : (phase === 'setup' || settingsOpen) ? (
                                <section className={styles.main}>
                                    <header className={styles.mainHeader}>
                                        <button
                                            type="button"
                                            className={styles.collapseBtn}
                                            onClick={this.handleMinimize}
                                            aria-label="最小化"
                                        >
                                            ←
                                        </button>
                                        <div className={styles.mainTitle}>
                                            <strong>{settingsOpen ? 'PEAgent 设置' : 'PEAgent'}</strong>
                                            <span>{settingsOpen ? '模型接入与权限' : '连接模型后开始对话'}</span>
                                        </div>
                                        <span className={styles.headerSpacer} />
                                        <button
                                            type="button"
                                            className={styles.closeBtn}
                                            onClick={this.handleClose}
                                            aria-label="关闭"
                                        >
                                            ×
                                        </button>
                                    </header>
                                    {this.renderSettings()}
                                </section>
                            ) : this.renderChat()}
                        </div>
                    </div>
                ) : null}
                {this.renderMinimized()}
            </React.Fragment>
        );
    }
}

PointerPeAgent.propTypes = {
    vm: PropTypes.shape({
        editingTarget: PropTypes.object,
        runtime: PropTypes.object,
        emitWorkspaceUpdate: PropTypes.func,
        addCostume: PropTypes.func
    }).isRequired,
    onClose: PropTypes.func.isRequired
};

export default PointerPeAgent;