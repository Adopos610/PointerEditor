import PropTypes from 'prop-types';
import React from 'react';

import {
    REGISTER_URL,
    clearAccount,
    fetchMe,
    getAccount,
    loginAccount as loginWithPassword,
    logoutAccount,
    saveAccount,
    updateStoredUser
} from '../../lib/pointer-account';
import CollabSession, {
    DEFAULT_SERVER,
    MAX_SNAPSHOT_BASE64,
    MAX_TARGET_BLOCKS,
    OFFICIAL_SERVERS,
    base64ToArrayBuffer,
    encodeProjectSnapshot,
    isInsecureServer,
    makeRoomCode,
    normalizeRoomCode,
    normalizeServer
} from '../../lib/pointer-collab';
import styles from './pointer-collab-modal.css';

const ACCOUNT_CENTER = 'https://vable.ctspace.xyz';
const LAST_ACCOUNT_KEY = 'pointere.lastAccount';

const formatTime = () => {
    const now = new Date();
    return [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(value => String(value).padStart(2, '0'))
        .join(':');
};

const targetName = target => (target.isStage ? '舞台' : target.getName());

const snapshotBlocks = target => JSON.stringify(target.blocks._blocks || {});

const parseBlocks = data => {
    if (typeof data !== 'string' || !data) throw new Error('代码数据为空');
    if (data.length > MAX_TARGET_BLOCKS) throw new Error('角色代码超过 4MB 同步上限');
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('代码数据格式不正确');
    }
    const blocks = {};
    Object.keys(parsed).forEach(id => {
        if (id === '__proto__' || id === 'constructor' || id === 'prototype') return;
        const block = parsed[id];
        if (!block || typeof block !== 'object' || typeof block.opcode !== 'string') return;
        blocks[id] = block;
    });
    return {blocks, text: JSON.stringify(blocks)};
};

class PointerCollabModal extends React.Component {
    constructor (props) {
        super(props);
        const storedServer = localStorage.getItem('pointer.collab.server') || DEFAULT_SERVER;
        const storedPreset = OFFICIAL_SERVERS.find(item => item.url === storedServer);
        this.state = {
            phase: 'checking',
            account: null,
            authBusy: false,
            loginAccount: localStorage.getItem(LAST_ACCOUNT_KEY) || '',
            loginPassword: '',
            loginError: '',
            needsVerification: false,
            serverPreset: storedPreset ? storedPreset.id : 'custom',
            server: storedServer,
            customServer: storedPreset ? '' : storedServer,
            roomCode: '',
            connecting: false,
            connected: false,
            room: '',
            selfId: '',
            hostId: '',
            peers: [],
            claims: [],
            projectLocked: false,
            targets: [],
            editingTargetId: '',
            status: '',
            lastSync: '',
            notice: null,
            lockRequests: [],
            pendingRequestTarget: '',
            error: ''
        };
        this.mounted = false;
        this.session = null;
        this.gotInitialState = false;
        this.disconnecting = false;
        this.sendingSnapshot = false;
        this.pendingSnapshot = false;
        this.knownBlocks = {};
        this.lastSentByTarget = {};
        this.pendingBlockMap = new Map();
        this.applyingState = false;
        this.suppressUntil = 0;
        this.pushTimer = null;
        this.requestTimer = null;
        this.snapshotTimer = null;
        this.structureTimer = null;
        this.lastSnapshotAt = 0;
        this.lastStructureSig = null;
        this.handleChange = this.handleChange.bind(this);
        this.handleServerPresetChange = this.handleServerPresetChange.bind(this);
        this.resolveServer = this.resolveServer.bind(this);
        this.handleLogin = this.handleLogin.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
        this.handleOpenRegister = this.handleOpenRegister.bind(this);
        this.handleCreate = this.handleCreate.bind(this);
        this.handleJoin = this.handleJoin.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleSyncNow = this.handleSyncNow.bind(this);
        this.handleCopyInvite = this.handleCopyInvite.bind(this);
        this.handleProjectChanged = this.handleProjectChanged.bind(this);
        this.handleTargetsUpdate = this.handleTargetsUpdate.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleClaim = this.handleClaim.bind(this);
        this.handleRelease = this.handleRelease.bind(this);
        this.handleRequestEdit = this.handleRequestEdit.bind(this);
        this.handleHostLock = this.handleHostLock.bind(this);
        this.handleRespondRequest = this.handleRespondRequest.bind(this);
        this.handleSelectTarget = this.handleSelectTarget.bind(this);
        this.handleDismissNotice = this.handleDismissNotice.bind(this);
        this.handleTodoPublish = this.handleTodoPublish.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        const vm = this.props.vm;
        if (vm && typeof vm.on === 'function') {
            vm.on('PROJECT_CHANGED', this.handleProjectChanged);
            vm.on('targetsUpdate', this.handleTargetsUpdate);
        }
        this.refreshTargets();
        window.addEventListener('pointere-collab-todo-publish', this.handleTodoPublish);
        const stored = getAccount();
        if (!stored) {
            this.setState({phase: 'login'});
            return;
        }
        this.setState({account: stored});
        fetchMe(stored.token)
            .then(data => {
                if (!this.mounted) return;
                updateStoredUser(data.user);
                this.setState({phase: 'join', account: {token: stored.token, user: data.user}});
            })
            .catch(error => {
                if (!this.mounted) return;
                if (error.status === 401 || error.status === 403) {
                    clearAccount();
                    this.setState({
                        phase: 'login',
                        account: null,
                        loginError: '登录状态已失效，请重新登录 PointerE 账号'
                    });
                    return;
                }
                this.setState({
                    phase: 'join',
                    account: stored,
                    error: error.message
                });
            });
    }

    componentWillUnmount () {
        this.mounted = false;
        clearTimeout(this.pushTimer);
        clearTimeout(this.requestTimer);
        clearTimeout(this.snapshotTimer);
        clearTimeout(this.structureTimer);
        window.removeEventListener('pointere-collab-todo-publish', this.handleTodoPublish);
        const vm = this.props.vm;
        if (vm && typeof vm.removeListener === 'function') {
            vm.removeListener('PROJECT_CHANGED', this.handleProjectChanged);
            vm.removeListener('targetsUpdate', this.handleTargetsUpdate);
        }
        if (this.session) {
            this.session.close();
            this.session = null;
        }
    }

    publishStatus () {
        if (!this.mounted || !this.props.onCollabState) return;
        const {connecting, connected, room, peers, notice} = this.state;
        this.props.onCollabState({
            active: Boolean(connected || connecting),
            connecting: Boolean(connecting),
            room,
            peers: peers.length,
            notice: notice ? notice.message : ''
        });
    }

    update (patch, callback) {
        this.setState(patch, () => {
            this.publishStatus();
            if (callback) callback();
        });
    }

    showNotice (message, level = 'info', targetId = '') {
        this.update({
            notice: message ? {message, level, targetId, at: formatTime()} : null
        });
    }

    handleChange (event) {
        const {name, value} = event.target;
        this.setState({[name]: value});
    }

    handleServerPresetChange (event) {
        const serverPreset = event.target.value;
        if (serverPreset === 'custom') {
            this.setState({serverPreset, error: ''});
            return;
        }
        const preset = OFFICIAL_SERVERS.find(item => item.id === serverPreset);
        this.setState({
            serverPreset,
            server: preset ? preset.url : DEFAULT_SERVER,
            error: ''
        });
    }

    resolveServer () {
        const {serverPreset, customServer} = this.state;
        if (serverPreset === 'custom') return normalizeServer(customServer);
        const preset = OFFICIAL_SERVERS.find(item => item.id === serverPreset);
        return preset ? preset.url : DEFAULT_SERVER;
    }

    handleLogin (event) {
        event.preventDefault();
        const accountName = this.state.loginAccount.trim();
        const password = this.state.loginPassword;
        if (!accountName || !password) {
            this.setState({loginError: '请输入 PointerE 用户名（或邮箱）和密码'});
            return;
        }
        this.setState({authBusy: true, loginError: '', needsVerification: false});
        loginWithPassword(accountName, password)
            .then(data => {
                if (!this.mounted) return;
                saveAccount(data.token, data.user);
                localStorage.setItem(LAST_ACCOUNT_KEY, accountName);
                this.setState({
                    account: {token: data.token, user: data.user},
                    phase: 'join',
                    authBusy: false,
                    loginPassword: '',
                    needsVerification: false,
                    error: ''
                });
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({
                    authBusy: false,
                    loginError: error.message,
                    needsVerification: error.code === 'unverified'
                });
            });
    }

    handleLogout () {
        const {account, connected} = this.state;
        if (connected) this.handleDisconnect();
        if (account && account.token) {
            logoutAccount(account.token).catch(() => {});
        }
        clearAccount();
        this.setState({
            account: null,
            phase: 'login',
            loginPassword: '',
            loginError: '',
            needsVerification: false,
            room: '',
            peers: [],
            claims: [],
            projectLocked: false,
            notice: null,
            lockRequests: [],
            status: '',
            error: ''
        });
    }

    handleOpenRegister () {
        window.open(REGISTER_URL, '_blank', 'noopener');
    }

    handleClose () {
        this.props.onClose();
    }

    handleCreate (event) {
        event.preventDefault();
        this.startSession(makeRoomCode());
    }

    handleJoin (event) {
        event.preventDefault();
        const room = normalizeRoomCode(this.state.roomCode);
        if (!/^[A-Z0-9]{4,12}$/.test(room)) {
            this.setState({error: '房间码需为 4-12 位字母或数字'});
            return;
        }
        this.startSession(room);
    }

    startSession (room) {
        const {serverPreset, customServer, account} = this.state;
        if (!account || !account.token) {
            this.setState({phase: 'login', error: '请先登录 PointerE 账号'});
            return;
        }
        if (serverPreset === 'custom' && !customServer.trim()) {
            this.setState({error: '请填写自定义协作服务器地址'});
            return;
        }
        const server = this.resolveServer();
        try {
            const url = new URL(server);
            if (!/^wss?:$/.test(url.protocol) || !url.hostname) throw new Error('bad server');
        } catch (error) {
            this.setState({error: '服务器地址格式不正确，请填写 wss:// 开头的地址'});
            return;
        }
        if (isInsecureServer(server)) {
            this.setState({error: '公网协作服务器必须使用 wss:// 加密连接；ws:// 仅允许本机或局域网地址'});
            return;
        }
        localStorage.setItem('pointer.collab.server', server);
        if (this.session) this.session.close();
        this.session = null;
        this.gotInitialState = false;
        this.lastSnapshotAt = 0;
        this.lastStructureSig = null;
        this.knownBlocks = {};
        this.lastSentByTarget = {};
        this.pendingBlockMap.clear();
        this.applyingState = false;
        this.suppressUntil = 0;
        this.disconnecting = false;
        this.refreshTargets(true);
        this.update({
            connecting: true,
            connected: false,
            server,
            roomCode: room,
            room,
            error: '',
            status: '正在连接协作服务器…',
            peers: [],
            claims: [],
            projectLocked: false,
            lastSync: '',
            notice: null,
            lockRequests: [],
            pendingRequestTarget: ''
        });

        const session = new CollabSession({
            server,
            room,
            token: account.token,
            handlers: {
                onJoined: message => {
                    if (this.session !== session) return;
                    this.handleJoined(message);
                },
                onPeers: message => {
                    if (!this.mounted || this.session !== session) return;
                    this.update({
                        peers: message.peers || [],
                        hostId: message.hostId || ''
                    });
                },
                onLocks: message => {
                    if (!this.mounted || this.session !== session) return;
                    this.handleLocks(message);
                },
                onState: message => {
                    if (!this.mounted || this.session !== session) return;
                    if (message.from === session.selfId) return;
                    this.gotInitialState = true;
                    const fromName = message.from === 'server' ? '房间快照' : (message.name || '对方');
                    this.applyRemoteState(message.data, fromName);
                },
                onBlocks: message => {
                    if (!this.mounted || this.session !== session) return;
                    if (message.from === session.selfId) return;
                    this.handleRemoteBlocks(message);
                },
                onStateRequest: () => {
                    if (!this.mounted || this.session !== session) return;
                    if (!this.state.connected || this.state.hostId !== this.state.selfId) return;
                    this.sendSnapshot('join');
                },
                onTodo: message => {
                    if (!this.mounted || this.session !== session) return;
                    window.dispatchEvent(new CustomEvent('pointere-collab-todos', {
                        detail: {
                            todos: message.todos || [],
                            from: message.from || '',
                            name: message.name || ''
                        }
                    }));
                },
                onNotice: message => {
                    if (!this.mounted || this.session !== session) return;
                    this.showNotice(message.message || '', message.level || 'info');
                },
                onLockRequest: message => {
                    if (!this.mounted || this.session !== session) return;
                    this.handleLockRequest(message);
                },
                onLockResponse: message => {
                    if (!this.mounted || this.session !== session) return;
                    this.update({pendingRequestTarget: ''});
                    this.showNotice(message.message || '', message.granted ? 'info' : 'warn',
                        message.granted ? '' : message.targetId);
                },
                onError: (text, raw) => {
                    if (!this.mounted || this.session !== session) return;
                    if (raw && raw.code === 'auth') {
                        this.handleAuthFailed(text);
                        return;
                    }
                    if (raw && raw.code === 'locked' && raw.targetId) {
                        this.handleLockedEdit(raw.targetId, text);
                        return;
                    }
                    this.setState({error: text, connecting: false});
                },
                onClose: wasClosedByUs => {
                    if (!this.mounted || this.session !== session) return;
                    const intentional = wasClosedByUs || this.disconnecting;
                    this.session = null;
                    window.dispatchEvent(new CustomEvent('pointere-collab-closed'));
                    this.update({
                        connected: false,
                        connecting: false,
                        peers: [],
                        claims: [],
                        projectLocked: false,
                        lockRequests: [],
                        pendingRequestTarget: '',
                        status: intentional ? '已退出协作' : '连接已断开，请重新加入',
                        error: intentional ? '' : '与协作服务器的连接已断开'
                    });
                }
            }
        });
        this.session = session;
        session.connect();
    }

    handleAuthFailed (message) {
        if (this.session) {
            this.session.close();
            this.session = null;
        }
        clearAccount();
        this.setState({
            account: null,
            phase: 'login',
            connected: false,
            connecting: false,
            peers: [],
            claims: [],
            lockRequests: [],
            loginError: message || 'PointerE 登录状态已失效，请重新登录',
            status: '',
            error: ''
        });
    }

    handleJoined (message) {
        if (!this.mounted) return;
        const peers = message.peers || [];
        const waiting = peers.length <= 1;
        if (message.user) updateStoredUser(message.user);
        this.lastStructureSig = this.targetSignature();
        window.dispatchEvent(new CustomEvent('pointere-collab-joined', {
            detail: {
                room: message.room,
                selfId: message.id,
                hostId: message.hostId,
                isHost: message.hostId === message.id
            }
        }));
        this.update({
            connecting: false,
            connected: true,
            room: message.room,
            selfId: message.id,
            hostId: message.hostId,
            peers,
            account: message.user ? {token: this.state.account.token, user: message.user} : this.state.account,
            status: waiting ? '房间已创建，等待其他人加入' : '已进入房间，正在同步代码…',
            error: ''
        });
        this.refreshTargets();
        this.rebuildKnownBlocks();
        clearTimeout(this.requestTimer);
        this.requestTimer = setTimeout(() => {
            if (!this.mounted || !this.session || this.gotInitialState) return;
            if (this.state.peers.length > 1 && this.state.hostId !== this.state.selfId) {
                this.session.requestState();
            }
        }, 1200);
    }

    handleLocks (message) {
        const claims = message.claims || [];
        const patch = {
            claims,
            projectLocked: Boolean(message.projectLocked),
            hostId: message.hostId || this.state.hostId
        };
        const claim = claims.find(item => item.targetId === this.state.pendingRequestTarget);
        if (claim && claim.clientId === this.state.selfId) {
            patch.pendingRequestTarget = '';
        }
        if (this.state.hostId === this.state.selfId && message.projectLocked) {
            patch.status = '你已锁定全部代码，其他人暂时不能修改';
        }
        this.update(patch);
    }

    handleLockRequest (message) {
        const request = {
            targetId: message.targetId,
            from: message.from || {id: '', name: '对方'},
            at: formatTime()
        };
        const requests = this.state.lockRequests.filter(item => (
            item.targetId !== request.targetId || item.from.id !== request.from.id
        ));
        requests.push(request);
        this.update({
            lockRequests: requests,
            notice: {
                message: `${request.from.name} 申请编辑「${this.labelForTarget(request.targetId)}」`,
                level: 'warn',
                targetId: request.targetId,
                at: request.at
            }
        });
    }

    handleLockedEdit (targetId, serverMessage) {
        const claim = this.claimFor(targetId);
        const owner = claim ? claim.name : '房主';
        const message = `用户：${owner} 已锁定该代码，点击发送申请`;
        this.revertTarget(targetId);
        this.update({
            notice: {message, level: 'warn', targetId, at: formatTime()},
            pendingRequestTarget: claim && claim.clientId !== this.state.selfId ? targetId : '',
            status: serverMessage || message
        });
    }

    handleRespondRequest (request, granted) {
        if (!this.session) return;
        this.session.respondLock(request.targetId, request.from.id, granted);
        this.setState({
            lockRequests: this.state.lockRequests.filter(item => (
                item.targetId !== request.targetId || item.from.id !== request.from.id
            ))
        });
    }

    handleClaim (targetId) {
        if (!this.session) return;
        this.session.claim(targetId);
        this.setState({notice: null});
    }

    handleRelease (targetId) {
        if (!this.session) return;
        this.session.release(targetId);
    }

    handleRequestEdit (targetId) {
        if (!this.session) return;
        const claim = this.claimFor(targetId);
        if (!claim) return;
        this.session.requestLock(targetId);
        this.update({
            pendingRequestTarget: targetId,
            notice: {
                message: `已向 ${claim.name} 发送编辑申请，等待对方同意`,
                level: 'info',
                targetId,
                at: formatTime()
            }
        });
    }

    handleHostLock () {
        if (!this.session) return;
        this.session.setHostLock(!this.state.projectLocked);
    }

    handleSelectTarget (targetId) {
        if (this.props.vm && this.props.vm.editingTarget && this.props.vm.editingTarget.id === targetId) return;
        this.props.vm.setEditingTarget(targetId);
        this.refreshTargets();
    }

    handleDismissNotice () {
        this.setState({notice: null});
    }

    handleTodoPublish (event) {
        if (!this.session || !this.state.connected) return;
        const todos = event && event.detail && Array.isArray(event.detail.todos) ?
            event.detail.todos : [];
        this.session.sendTodos(todos);
    }

    handleDisconnect () {
        this.disconnecting = true;
        clearTimeout(this.pushTimer);
        clearTimeout(this.requestTimer);
        clearTimeout(this.snapshotTimer);
        clearTimeout(this.structureTimer);
        this.pushTimer = null;
        this.requestTimer = null;
        this.snapshotTimer = null;
        this.structureTimer = null;
        if (this.session) {
            this.session.close();
            this.session = null;
        }
        this.pendingBlockMap.clear();
        this.knownBlocks = {};
        this.lastSentByTarget = {};
        this.update({
            connected: false,
            connecting: false,
            peers: [],
            claims: [],
            projectLocked: false,
            lockRequests: [],
            pendingRequestTarget: '',
            room: '',
            selfId: '',
            hostId: '',
            status: '已退出协作',
            notice: null,
            error: ''
        });
        this.disconnecting = false;
    }

    handleSyncNow (event) {
        if (event) event.preventDefault();
        this.sendSnapshot('manual');
    }

    handleCopyInvite () {
        const {room, server} = this.state;
        const text = `房间码：${room}\n协作服务器：${server}\n请先注册并登录 PointerE 账号：${REGISTER_URL}\n然后在 PointerEditor 打开「云端 → 在线协作」，输入房间码即可一起编辑。`;
        const done = () => this.showNotice('邀请信息已复制', 'info');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
        } else {
            this.fallbackCopy(text, done);
        }
    }

    fallbackCopy (text, done) {
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        try {
            document.execCommand('copy');
            done();
        } catch (error) {
            this.setState({error: '复制失败，请手动记录房间码'});
        }
        document.body.removeChild(input);
    }

    handleProjectChanged () {
        if (!this.mounted || !this.state.connected || this.disconnecting) return;
        if (this.applyingState || Date.now() < this.suppressUntil) return;
        if (this.pushTimer) return;
        this.pushTimer = setTimeout(() => {
            this.pushTimer = null;
            this.pushLocalBlocks();
        }, 280);
    }

    handleTargetsUpdate () {
        if (!this.mounted) return;
        this.refreshTargets();
        if (!this.state.connected || this.state.hostId !== this.state.selfId) return;
        if (this.applyingState || Date.now() < this.suppressUntil) return;
        const signature = this.targetSignature();
        if (this.lastStructureSig === null) {
            this.lastStructureSig = signature;
            return;
        }
        if (signature !== this.lastStructureSig) {
            this.lastStructureSig = signature;
            clearTimeout(this.structureTimer);
            this.structureTimer = setTimeout(() => {
                if (this.state.peers.length > 1) this.sendSnapshot('structure');
            }, 1500);
        }
    }

    refreshTargets (resetSignature) {
        const vm = this.props.vm;
        if (!vm || !vm.runtime) return;
        const targets = (vm.runtime.targets || [])
            .filter(target => target.isOriginal)
            .map(target => ({
                id: target.id,
                key: this.syncKeyFor(target),
                name: targetName(target),
                isStage: Boolean(target.isStage)
            }));
        const editingTargetId = vm.editingTarget ? vm.editingTarget.id : '';
        this.setState({targets, editingTargetId});
        if (resetSignature) this.lastStructureSig = targets.map(item => (
            `${item.id}:${item.name}:${item.isStage ? 1 : 0}`
        )).join('|');
    }

    targetSignature () {
        const vm = this.props.vm;
        if (!vm || !vm.runtime) return '';
        return (vm.runtime.targets || [])
            .filter(target => target.isOriginal)
            .map(target => `${targetName(target)}:${target.isStage ? 1 : 0}`)
            .join('|');
    }

    syncKeyFor (target) {
        if (!target) return '';
        if (target.isStage) return 'stage';
        const vm = this.props.vm;
        const sprites = (vm.runtime.targets || []).filter(item => item.isOriginal && !item.isStage);
        const index = sprites.indexOf(target);
        return index >= 0 ? `sprite-${index}` : '';
    }

    targetForKey (key) {
        const vm = this.props.vm;
        if (!vm || !vm.runtime) return null;
        const originals = (vm.runtime.targets || []).filter(target => target.isOriginal);
        if (key === 'stage') return originals.find(target => target.isStage) || null;
        const match = /^sprite-(\d+)$/.exec(String(key || ''));
        if (!match) return null;
        return originals.filter(target => !target.isStage)[Number(match[1])] || null;
    }

    rebuildKnownBlocks () {
        const vm = this.props.vm;
        if (!vm || !vm.runtime) return;
        this.knownBlocks = {};
        this.lastSentByTarget = {};
        (vm.runtime.targets || []).filter(target => target.isOriginal).forEach(target => {
            const key = this.syncKeyFor(target);
            if (!key) return;
            const data = snapshotBlocks(target);
            this.knownBlocks[key] = data;
            this.lastSentByTarget[key] = data;
        });
    }

    pushLocalBlocks () {
        const vm = this.props.vm;
        if (!this.mounted || !this.session || !this.state.connected) return;
        if (this.applyingState || this.disconnecting) return;
        const target = vm.editingTarget;
        if (!target || !target.isOriginal) return;
        const targetKey = this.syncKeyFor(target);
        if (!targetKey) return;
        const data = snapshotBlocks(target);
        if (data === this.lastSentByTarget[targetKey]) return;
        const claim = this.claimFor(targetKey);
        if (claim && claim.clientId !== this.state.selfId) {
            this.handleLockedEdit(targetKey, '');
            return;
        }
        if (this.state.projectLocked && this.state.hostId !== this.state.selfId) {
            this.revertTarget(targetKey);
            this.update({
                notice: {message: '房主已锁定全部代码，暂时无法修改', level: 'warn', targetId: targetKey, at: formatTime()},
                status: '房主已锁定全部代码'
            });
            return;
        }
        if (data.length > MAX_TARGET_BLOCKS) {
            this.showNotice('当前角色代码超过 4MB，无法实时同步', 'warn');
            return;
        }
        if (!this.session.sendBlocks(targetKey, data)) return;
        this.lastSentByTarget[targetKey] = data;
        this.knownBlocks[targetKey] = data;
        const stamp = formatTime();
        this.setState({lastSync: stamp, status: `已实时同步修改 · ${stamp}`, error: ''});
    }

    handleRemoteBlocks (message) {
        const targetKey = String(message.targetId || '');
        if (!targetKey) return;
        if (this.applyingState) {
            this.pendingBlockMap.set(targetKey, message.data);
            return;
        }
        const applied = this.applyRemoteBlocks(targetKey, message.data);
        if (!applied) {
            this.showNotice('收到未知角色的代码，请让房主重新同步整个项目', 'warn');
            return;
        }
        const name = message.name || '对方';
        const stamp = formatTime();
        this.setState({lastSync: stamp, status: `已同步 ${name} 的修改 · ${stamp}`});
    }

    applyRemoteBlocks (targetKey, data) {
        let parsed;
        try {
            parsed = parseBlocks(data);
        } catch (error) {
            this.showNotice(error.message, 'warn');
            return false;
        }
        const vm = this.props.vm;
        const target = this.targetForKey(targetKey);
        if (!target) return false;
        this.suppressUntil = Date.now() + 500;
        target.blocks.deleteAllBlocks();
        Object.keys(parsed.blocks).forEach(id => target.blocks.createBlock(parsed.blocks[id]));
        target.blocks.updateTargetSpecificBlocks(target.isStage);
        this.knownBlocks[targetKey] = parsed.text;
        this.lastSentByTarget[targetKey] = parsed.text;
        if (vm.editingTarget && vm.editingTarget.id === target.id) {
            vm.emitWorkspaceUpdate();
        }
        return true;
    }

    revertTarget (targetKey) {
        const data = this.knownBlocks[targetKey];
        if (!data) return;
        this.applyRemoteBlocks(targetKey, data);
    }

    applyRemoteState (data, fromName) {
        if (typeof data !== 'string' || data.length > MAX_SNAPSHOT_BASE64) {
            this.setState({error: '收到的项目数据超过同步上限，已拒绝应用'});
            return;
        }
        let buffer;
        try {
            buffer = base64ToArrayBuffer(data);
        } catch (error) {
            this.setState({error: '收到的项目数据损坏，无法应用'});
            return;
        }
        this.applyingState = true;
        this.suppressUntil = Date.now() + 1200;
        this.pendingBlockMap.clear();
        Promise.resolve(this.props.vm.loadProject(buffer))
            .then(() => {
                if (!this.mounted) return;
                this.refreshTargets(true);
                this.rebuildKnownBlocks();
                this.pendingBlockMap.forEach((blockData, targetId) => {
                    this.applyRemoteBlocks(targetId, blockData);
                });
                this.pendingBlockMap.clear();
                this.applyingState = false;
                const stamp = formatTime();
                this.setState({
                    status: `已同步${fromName}的项目 · ${stamp}`,
                    lastSync: stamp,
                    error: ''
                });
                this.suppressUntil = Date.now() + 1200;
            })
            .catch(error => {
                this.applyingState = false;
                if (!this.mounted) return;
                this.setState({error: `应用对方项目失败：${error.message}`});
            });
    }

    sendSnapshot (reason) {
        if (!this.mounted || !this.session || !this.state.connected) return;
        if (this.state.hostId !== this.state.selfId) return;
        if (this.sendingSnapshot) {
            this.pendingSnapshot = true;
            return;
        }
        if (reason !== 'manual' && Date.now() - this.lastSnapshotAt < 600) return;
        this.sendingSnapshot = true;
        if (reason === 'manual' || reason === 'join') {
            this.setState({status: '正在把整个项目同步给对方…'});
        }
        encodeProjectSnapshot(this.props.vm)
            .then(data => {
                if (!this.mounted || !this.session) return;
                if (this.session.sendState(data)) {
                    this.lastSnapshotAt = Date.now();
                    const stamp = formatTime();
                    this.setState({
                        lastSync: stamp,
                        status: reason === 'manual'
                            ? `整个项目已同步 · ${stamp}`
                            : `已发送项目快照 · ${stamp}`,
                        error: ''
                    });
                }
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({error: `同步项目失败：${error.message}`});
            })
            .then(() => {
                this.sendingSnapshot = false;
                if (this.pendingSnapshot) {
                    this.pendingSnapshot = false;
                    this.sendSnapshot('queued');
                }
            });
    }

    claimFor (targetId) {
        return this.state.claims.find(item => item.targetId === targetId) || null;
    }

    labelForTarget (targetKey) {
        const target = this.state.targets.find(item => item.key === targetKey);
        return target ? target.name : '该角色';
    }

    renderLogin () {
        const {loginAccount, loginPassword, authBusy, loginError, needsVerification} = this.state;
        return (
            <form className={styles.form} onSubmit={this.handleLogin}>
                <div className={styles.accountIntro}>
                    <div className={styles.accountIntroTitle}>登录 PointerE 账号</div>
                    <p className={styles.hint}>
                        PointerE 账号仅用于在线协作，与创客次元账号相互独立。登录后可以和同伴实时编辑同一个项目。
                    </p>
                </div>
                <label className={styles.field}>
                    <span>用户名或邮箱</span>
                    <input
                        name="loginAccount"
                        value={loginAccount}
                        onChange={this.handleChange}
                        autoComplete="username"
                        spellCheck={false}
                        disabled={authBusy}
                    />
                </label>
                <label className={styles.field}>
                    <span>密码</span>
                    <input
                        name="loginPassword"
                        type="password"
                        value={loginPassword}
                        onChange={this.handleChange}
                        autoComplete="current-password"
                        disabled={authBusy}
                    />
                </label>
                {loginError ? <p className={styles.error}>{loginError}</p> : null}
                {needsVerification ? (
                    <p className={styles.hint}>
                        请打开注册邮箱完成验证。没有收到邮件时，可在注册页重新发送，或联系管理员。
                    </p>
                ) : null}
                <div className={styles.actions}>
                    <button type="submit" className={styles.primary} disabled={authBusy}>
                        {authBusy ? '登录中…' : '登录'}
                    </button>
                    <button type="button" className={styles.secondary} onClick={this.handleOpenRegister}>
                        注册 PointerE 账号
                    </button>
                </div>
                <p className={styles.hint}>
                    账号中心：{ACCOUNT_CENTER} · 注册需要图形验证码和邮箱验证
                </p>
            </form>
        );
    }

    renderAccountBar () {
        const {account} = this.state;
        if (!account || !account.user) return null;
        const user = account.user;
        const initial = String(user.username || 'P').slice(0, 1).toUpperCase();
        return (
            <div className={styles.accountBar}>
                <span className={styles.accountAvatar}>{initial}</span>
                <span className={styles.accountMeta}>
                    <strong>{user.nickname || user.username}</strong>
                    <span>@{user.username} · PointerE 账号</span>
                </span>
                <button type="button" className={styles.linkButton} onClick={this.handleLogout}>
                    退出登录
                </button>
            </div>
        );
    }

    renderJoinForm () {
        const {serverPreset, customServer, roomCode, connecting, account} = this.state;
        return (
            <form className={styles.form} onSubmit={this.handleJoin}>
                {this.renderAccountBar()}
                <label className={styles.field}>
                    <span>协作服务器</span>
                    <select
                        name="serverPreset"
                        value={serverPreset}
                        onChange={this.handleServerPresetChange}
                        disabled={connecting}
                    >
                        {OFFICIAL_SERVERS.map(item => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                        <option value="custom">自定义协作服务器</option>
                    </select>
                </label>
                {serverPreset === 'custom' ? (
                    <label className={styles.field}>
                        <span>服务器地址</span>
                        <input
                            name="customServer"
                            value={customServer}
                            onChange={this.handleChange}
                            placeholder="wss://your-server.example.com"
                            spellCheck={false}
                            disabled={connecting}
                        />
                    </label>
                ) : null}
                <p className={styles.hint}>
                    {serverPreset === 'custom'
                        ? '公网服务器必须使用 wss:// 加密连接；ws:// 仅允许本机或局域网地址。'
                        : '官方节点通过 WSS（TLS）加密传输，进入房间需要已验证的 PointerE 账号。'}
                </p>
                <label className={styles.field}>
                    <span>房间码</span>
                    <input
                        name="roomCode"
                        value={roomCode}
                        onChange={this.handleChange}
                        maxLength={12}
                        placeholder="输入同伴给你的房间码"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={connecting}
                    />
                </label>
                <p className={styles.hint}>
                    进入同一房间后，积木修改会实时同步；每个角色同一时间由一名成员认领编辑，房主可以锁定全部代码。
                </p>
                <div className={styles.actions}>
                    <button type="button" className={styles.primary} onClick={this.handleCreate} disabled={connecting || !account}>
                        创建房间
                    </button>
                    <button type="submit" className={styles.secondary} disabled={connecting || !account}>
                        加入房间
                    </button>
                </div>
            </form>
        );
    }

    renderNotice () {
        const {notice} = this.state;
        if (!notice) return null;
        const claim = notice.targetId ? this.claimFor(notice.targetId) : null;
        const canRequest = claim && claim.clientId !== this.state.selfId &&
            this.state.pendingRequestTarget !== notice.targetId;
        return (
            <div className={`${styles.notice} ${notice.level === 'warn' ? styles.noticeWarn : ''}`}>
                <span>{notice.message}</span>
                <span className={styles.noticeActions}>
                    {canRequest ? (
                        <button type="button" className={styles.miniButton} onClick={() => this.handleRequestEdit(notice.targetId)}>
                            发送申请
                        </button>
                    ) : null}
                    <button type="button" className={styles.noticeClose} onClick={this.handleDismissNotice} aria-label="关闭提示">
                        ×
                    </button>
                </span>
            </div>
        );
    }

    renderLockRequests () {
        const {lockRequests} = this.state;
        if (!lockRequests.length) return null;
        return (
            <div className={styles.requestList}>
                {lockRequests.map(request => (
                    <div key={`${request.targetId}-${request.from.id}`} className={styles.requestCard}>
                        <div>
                            <strong>{request.from.name}</strong> 申请编辑「{this.labelForTarget(request.targetId)}」
                        </div>
                        <div className={styles.inlineActions}>
                            <button
                                type="button"
                                className={styles.miniPrimary}
                                onClick={() => this.handleRespondRequest(request, true)}
                            >
                                同意
                            </button>
                            <button
                                type="button"
                                className={styles.miniButton}
                                onClick={() => this.handleRespondRequest(request, false)}
                            >
                                拒绝
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    renderTargets () {
        const {targets, claims, projectLocked, selfId, hostId, editingTargetId, pendingRequestTarget} = this.state;
        const isHost = hostId === selfId;
        if (!targets.length) {
            return <p className={styles.hint}>当前项目还没有可协作的角色。</p>;
        }
        return (
            <ul className={styles.targetList}>
                {targets.map(target => {
                    const claim = claims.find(item => item.targetId === target.key);
                    const mine = claim && claim.clientId === selfId;
                    const other = claim && !mine;
                    const projectBlocked = projectLocked && !isHost;
                    const canClaim = !claim && (!projectLocked || isHost);
                    return (
                        <li
                            key={target.key}
                            className={`${styles.targetRow} ${target.id === editingTargetId ? styles.targetCurrent : ''}`}
                        >
                            <button
                                type="button"
                                className={styles.targetName}
                                onClick={() => this.handleSelectTarget(target.id)}
                                title="切换到这个角色"
                            >
                                {target.name}
                                {target.isStage ? <span className={styles.targetKind}>舞台</span> : null}
                                {target.id === editingTargetId ? <span className={styles.targetKind}>当前</span> : null}
                            </button>
                            <span className={styles.targetState}>
                                {claim ? (
                                    <span className={mine ? styles.tagMine : styles.tagLocked}>
                                        {mine ? '我' : claim.name} 已锁定
                                    </span>
                                ) : projectBlocked ? (
                                    <span className={styles.tagLocked}>房主已锁定</span>
                                ) : (
                                    <span className={styles.tagOpen}>可编辑</span>
                                )}
                            </span>
                            <span className={styles.targetActions}>
                                {canClaim ? (
                                    <button type="button" className={styles.miniButton} onClick={() => this.handleClaim(target.key)}>
                                        认领
                                    </button>
                                ) : null}
                                {mine ? (
                                    <button type="button" className={styles.miniButton} onClick={() => this.handleRelease(target.key)}>
                                        释放
                                    </button>
                                ) : null}
                                {other ? (
                                    <button
                                        type="button"
                                        className={styles.miniButton}
                                        onClick={() => this.handleRequestEdit(target.key)}
                                        disabled={pendingRequestTarget === target.key}
                                    >
                                        {pendingRequestTarget === target.key ? '申请中…' : '申请编辑'}
                                    </button>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
        );
    }

    renderRoom () {
        const {room, peers, selfId, lastSync, projectLocked, hostId} = this.state;
        const isHost = hostId === selfId;
        return (
            <div className={styles.form}>
                {this.renderAccountBar()}
                <div className={styles.roomCard}>
                    <div>
                        <span className={styles.roomLabel}>房间码</span>
                        <strong className={styles.roomCode}>{room}</strong>
                    </div>
                    <button type="button" className={styles.secondary} onClick={this.handleCopyInvite}>
                        复制邀请
                    </button>
                </div>
                <div className={styles.peerList}>
                    {peers.map(peer => (
                        <span
                            key={peer.id}
                            className={peer.id === selfId ? styles.peerSelf : styles.peer}
                        >
                            {peer.nickname || peer.name}
                            {peer.host ? '（房主）' : ''}
                            {peer.id === selfId ? ' · 我' : ''}
                        </span>
                    ))}
                </div>
                {this.renderLockRequests()}
                {this.renderNotice()}
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>角色与代码锁定</span>
                    {isHost ? (
                        <button type="button" className={styles.miniPrimary} onClick={this.handleHostLock}>
                            {projectLocked ? '解锁全部代码' : '锁定全部代码'}
                        </button>
                    ) : null}
                </div>
                {this.renderTargets()}
                <p className={styles.hint}>
                    认领角色后只有你能修改该角色的积木；其他人想修改时，需要向你发送申请。房主锁定全部代码后，只有房主可以编辑。
                </p>
                <div className={styles.actions}>
                    <button type="button" className={styles.primary} onClick={this.handleClose}>
                        收起窗口
                    </button>
                    <button type="button" className={styles.secondary} onClick={this.handleDisconnect}>
                        断开协作
                    </button>
                </div>
                {isHost ? (
                    <button
                        type="button"
                        className={styles.linkButton}
                        onClick={this.handleSyncNow}
                    >
                        同步整个项目（房主）
                    </button>
                ) : null}
                <p className={styles.hint}>
                    {lastSync ? `最近同步：${lastSync}。` : ''}
                    收起窗口不会退出协作，房间成员仍可继续编辑。
                </p>
            </div>
        );
    }

    renderChecking () {
        return (
            <div className={styles.form}>
                <p className={styles.hint}>正在检查 PointerE 登录状态…</p>
            </div>
        );
    }

    render () {
        if (this.props.hidden) return null;
        const {phase, connecting, server, error, status} = this.state;
        let content;
        if (phase === 'checking') content = this.renderChecking();
        else if (phase === 'login') content = this.renderLogin();
        else if (this.state.connected) content = this.renderRoom();
        else content = this.renderJoinForm();
        return (
            <div className={styles.overlay} role="dialog" aria-modal="true">
                <div className={styles.panel}>
                    <header className={styles.header}>
                        <span>在线协作</span>
                        <button type="button" className={styles.close} onClick={this.handleClose} aria-label="收起">
                            ×
                        </button>
                    </header>
                    <div className={styles.body}>
                        {content}
                        {error ? <p className={styles.error}>{error}</p> : null}
                        {!error && status ? <p className={styles.status}>{status}</p> : null}
                        {connecting ? (
                            <p className={styles.hint}>正在连接 {server} …</p>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }
}

PointerCollabModal.propTypes = {
    vm: PropTypes.shape({
        loadProject: PropTypes.func,
        saveProjectSb3: PropTypes.func,
        on: PropTypes.func,
        removeListener: PropTypes.func,
        emitWorkspaceUpdate: PropTypes.func,
        setEditingTarget: PropTypes.func
    }).isRequired,
    hidden: PropTypes.bool,
    onCollabState: PropTypes.func,
    onClose: PropTypes.func.isRequired
};

PointerCollabModal.defaultProps = {
    hidden: false,
    onCollabState: null
};

export default PointerCollabModal;
