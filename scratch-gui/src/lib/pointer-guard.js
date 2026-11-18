/*
 * PointerGuard - real-time security engine for PointerEditor collaboration.
 *
 * It watches the collaboration channel and extension loading path, keeps a
 * rolling audit trail, blocks high-risk actions and preserves local snapshots
 * so a room member cannot hold the project hostage.
 */

const ALERT_LIMIT = 40;
const BACKUP_LIMIT = 3;
const BACKUP_MAX_BYTES = 48 * 1024 * 1024;

const LEVEL_RANK = {ok: 0, info: 0, warn: 1, critical: 2};

const toBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const ESCAPED_CONTROLS = /\\u00[01][0-9a-f]/gi;

const countBlockMap = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    return Object.keys(value).length;
};

/**
 * Detect text that looks encrypted, XORed or otherwise scrambled. Normal
 * project JSON never contains many raw control characters or \u000x escapes.
 */
export const looksScrambled = text => {
    const value = String(text || '');
    if (value.length < 200) return false;
    const control = (value.match(CONTROL_CHARS) || []).length;
    if (control / value.length > 0.005) return true;
    const escaped = (value.match(ESCAPED_CONTROLS) || []).length;
    if (escaped > 3) return true;
    const replacement = (value.match(/\ufffd/g) || []).length;
    if (replacement / value.length > 0.01) return true;
    return false;
};

export const analyzeProjectJson = (text, currentBlocks) => {
    let project;
    try {
        project = JSON.parse(text);
    } catch (error) {
        return {ok: false, reason: '项目 JSON 无法解析，内容可能已损坏'};
    }
    if (!project || !Array.isArray(project.targets)) {
        return {ok: false, reason: '项目结构异常，缺少角色列表'};
    }
    let blocks = 0;
    for (const target of project.targets) {
        blocks += countBlockMap(target && target.blocks);
    }
    const suspicious = looksScrambled(text);
    const destructive = Boolean(
        Number.isFinite(currentBlocks) &&
        currentBlocks >= 20 &&
        (blocks === 0 || blocks < currentBlocks * 0.1)
    );
    return {
        ok: true,
        blocks,
        targets: project.targets.length,
        suspicious,
        destructive,
        extensions: Array.isArray(project.extensions) ? project.extensions.slice(0, 50) : [],
        extensionURLs: project.extensionURLs && typeof project.extensionURLs === 'object' ?
            project.extensionURLs : {}
    };
};

const trimUrl = url => {
    const text = String(url || '');
    if (/^data:/i.test(text)) return 'data: 内嵌扩展';
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
};

class PointerGuard {
    constructor () {
        this.collab = {
            active: false,
            room: '',
            server: '',
            selfId: '',
            hostId: '',
            startedAt: 0
        };
        this.alerts = [];
        this.counters = new Map();
        this.claimSnapshot = new Map();
        this.level = 'ok';
        this.lockdown = false;
        this.lockdownReason = '';
        this.blockedExtensions = 0;
        this.backups = [];
        this.backupBusy = false;
        this.listeners = new Set();
        this.seq = 0;
    }

    /* ---------------------------------------------------------------- */
    /* Collaboration lifecycle                                          */
    /* ---------------------------------------------------------------- */

    startCollab ({room, server}) {
        this.collab = {
            active: true,
            room: String(room || ''),
            server: String(server || ''),
            selfId: '',
            hostId: '',
            startedAt: Date.now()
        };
        this.counters.clear();
        this.claimSnapshot = new Map();
        this.level = 'ok';
        this.lockdown = false;
        this.lockdownReason = '';
        this.addAlert('info', `安全引擎开始守护房间 ${this.collab.room}`);
    }

    setCollabIdentity ({selfId, hostId}) {
        if (!this.collab.active) return;
        if (selfId !== undefined) this.collab.selfId = String(selfId || '');
        if (hostId !== undefined) this.collab.hostId = String(hostId || '');
    }

    endCollab () {
        if (!this.collab.active) return;
        this.collab.active = false;
        this.collab.room = '';
        this.collab.selfId = '';
        this.collab.hostId = '';
        this.counters.clear();
        this.claimSnapshot = new Map();
        this.level = 'ok';
        this.lockdown = false;
        this.lockdownReason = '';
        this.emit();
    }

    isCollabActive () {
        return Boolean(this.collab.active);
    }

    isLockedDown () {
        return Boolean(this.lockdown);
    }

    /* ---------------------------------------------------------------- */
    /* Extension policy                                                 */
    /* ---------------------------------------------------------------- */

    inspectExtension ({url, trusted = false, automatic = false, unsandboxed = false}) {
        const reasons = [];
        let action = 'allow';
        const isDataUrl = /^data:/i.test(String(url || ''));
        if (this.collab.active && isDataUrl) {
            action = 'block';
            this.blockedExtensions += 1;
            reasons.push('协作进行中拒绝加载项目内嵌扩展，避免他人借项目注入脚本');
            this.addAlert('warn', '已拦截协作中的内嵌扩展', {
                url: trimUrl(url),
                reasons
            });
        } else if (!trusted && unsandboxed) {
            action = 'sandbox';
            reasons.push('未受信任的扩展必须运行在沙箱中');
        } else if (automatic && !trusted && this.collab.active) {
            reasons.push('协作项目请求加载外部扩展，需要你确认来源');
        }
        return {action, reasons};
    }

    shouldForceSandbox (trusted) {
        return Boolean(this.collab.active && !trusted);
    }

    /* ---------------------------------------------------------------- */
    /* Live collaboration watcher                                       */
    /* ---------------------------------------------------------------- */

    inspectTargetUpdate (previousData, nextData) {
        let previous = null;
        try {
            previous = JSON.parse(String(previousData || ''));
        } catch (error) {
            previous = null;
        }
        let next = null;
        try {
            next = JSON.parse(String(nextData || ''));
        } catch (error) {
            next = null;
        }
        const previousBlocks = countBlockMap(previous);
        const nextBlocks = countBlockMap(next);
        const destroyed = previousBlocks >= 8 && nextBlocks === 0;
        const massShrink = previousBlocks >= 20 && nextBlocks < previousBlocks * 0.15;
        const suspicious = looksScrambled(nextData);
        if (suspicious) {
            this.addAlert('warn', '收到疑似加密或乱码的代码改动，已保留上一版本', {});
        }
        return {
            destructive: destroyed || massShrink,
            previousBlocks,
            nextBlocks,
            suspicious
        };
    }

    bump (key, windowMs) {
        const now = Date.now();
        const entry = this.counters.get(key);
        if (!entry || now - entry.start > windowMs) {
            this.counters.set(key, {start: now, count: 1});
            return 1;
        }
        entry.count += 1;
        return entry.count;
    }

    observeCollab ({message}) {
        if (!this.collab.active || !message || typeof message.type !== 'string') return;
        const {type, from} = message;
        if (from && from === this.collab.selfId) return;

        if (type === 'state') {
            if (from === 'server') return;
            const counter = this.bump(`state:${from || 'unknown'}`, 30000);
            if (counter >= 14) {
                this.raise('critical', '有人在反复推送整个项目，可能试图强制覆盖所有人的内容', {from});
            } else if (counter >= 8) {
                this.raise('warn', '短时间内收到多次整体项目同步，请注意内容变化', {from});
            }
        } else if (type === 'locks') {
            const claims = Array.isArray(message.claims) ? message.claims : [];
            const current = new Map();
            for (const claim of claims) {
                const id = String(claim && claim.clientId || '');
                if (!id || id === this.collab.selfId) continue;
                if (!current.has(id)) current.set(id, new Set());
                current.get(id).add(String(claim.targetId || ''));
            }
            for (const [clientId, targets] of current) {
                if (clientId === this.collab.hostId) continue;
                const previous = this.claimSnapshot.get(clientId) || new Set();
                let added = 0;
                for (const targetId of targets) {
                    if (!previous.has(targetId)) added += 1;
                }
                if (added > 0) {
                    const counter = this.bump(`claim:${clientId}`, 15000);
                    if (counter >= 14 || targets.size >= 24) {
                        this.raise('critical', '检测到批量抢占代码锁，疑似恶意锁定操作', {clientId, count: targets.size});
                    } else if (counter >= 8 || targets.size >= 16) {
                        this.raise('warn', '有成员连续锁定多个角色，请留意', {clientId, count: targets.size});
                    }
                }
            }
            this.claimSnapshot = current;
        } else if (type === 'blocks') {
            const counter = this.bump(`blocks:${from || 'unknown'}`, 10000);
            if (counter >= 240) {
                this.raise('critical', '检测到异常高频的代码改写，已暂停接收远端改动', {from});
            } else if (counter >= 120) {
                this.raise('warn', '远端代码同步频率异常，网络可能不稳定或有人刷写', {from});
            }
        } else if (type === 'lock-request') {
            const counter = this.bump(`lockreq:${from && from.id || 'unknown'}`, 10000);
            if (counter >= 8) {
                this.raise('warn', '有成员在短时间内反复申请编辑权限', {});
            }
        } else if (type === 'todo') {
            const counter = this.bump(`todo:${from || 'unknown'}`, 30000);
            if (counter >= 8) {
                this.raise('warn', '有成员在频繁覆盖项目 TODO', {from});
            }
        } else if (type === 'chat') {
            const counter = this.bump(`chat:${from || 'unknown'}`, 10000);
            if (counter >= 30) {
                this.raise('warn', '有成员在刷屏聊天', {from});
            }
        }
    }

    raise (level, message, meta) {
        this.addAlert(level, message, meta);
        if (level === 'critical') {
            this.lockdown = true;
            this.lockdownReason = message;
        }
    }

    addAlert (level, message, meta) {
        const rank = LEVEL_RANK[level] === undefined ? 0 : LEVEL_RANK[level];
        if (rank > (LEVEL_RANK[this.level] || 0)) this.level = level;
        if (level === 'critical' && !this.lockdown) {
            this.lockdown = true;
            this.lockdownReason = message;
        }
        this.alerts.unshift({
            id: `guard_${Date.now()}_${++this.seq}`,
            at: Date.now(),
            level,
            message,
            meta: meta || {}
        });
        if (this.alerts.length > ALERT_LIMIT) this.alerts.length = ALERT_LIMIT;
        this.emit();
    }

    /* ---------------------------------------------------------------- */
    /* Snapshot backups and rollback                                    */
    /* ---------------------------------------------------------------- */

    createBackup (vm, reason) {
        if (!vm || typeof vm.saveProjectSb3 !== 'function') return Promise.resolve(null);
        if (this.backupBusy) return Promise.resolve(null);
        this.backupBusy = true;
        return Promise.resolve(vm.saveProjectSb3('arraybuffer'))
            .then(data => {
                this.backupBusy = false;
                if (!data || !data.byteLength) return null;
                if (data.byteLength > BACKUP_MAX_BYTES) return null;
                const entry = {
                    id: `backup_${Date.now()}_${++this.seq}`,
                    at: Date.now(),
                    reason: reason || '同步前自动备份',
                    size: data.byteLength,
                    data
                };
                this.backups = [entry, ...this.backups].slice(0, BACKUP_LIMIT);
                this.persistBackup(entry);
                this.addAlert('info', `已保留同步前快照（${Math.round(data.byteLength / 1024)} KB）`);
                return entry;
            })
            .catch(() => {
                this.backupBusy = false;
                return null;
            });
    }

    latestBackup () {
        return this.backups.length ? this.backups[0] : null;
    }

    persistBackup (entry) {
        try {
            if (typeof window === 'undefined' || !window.pointerDesktop ||
                typeof window.pointerDesktop.saveRecovery !== 'function') return;
            Promise.resolve(window.pointerDesktop.saveRecovery({
                name: 'sync',
                dataBase64: toBase64(entry.data)
            })).catch(() => {});
        } catch (error) {
            // Persistence failures must not break in-memory backups.
        }
    }

    clearBackups () {
        this.backups = [];
        this.emit();
    }

    /* ---------------------------------------------------------------- */
    /* State and subscriptions                                          */
    /* ---------------------------------------------------------------- */

    getState () {
        return {
            active: this.collab.active,
            room: this.collab.room,
            level: this.level,
            lockdown: this.lockdown,
            lockdownReason: this.lockdownReason,
            blockedExtensions: this.blockedExtensions,
            alerts: this.alerts.slice(0, 12),
            backups: this.backups.map(entry => ({
                id: entry.id,
                at: entry.at,
                reason: entry.reason,
                size: entry.size
            }))
        };
    }

    subscribe (listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    emit () {
        for (const listener of this.listeners) {
            try {
                listener(this.getState());
            } catch (error) {
                // A broken listener must not break the guard.
            }
        }
    }
}

const guard = new PointerGuard();

export default guard;
export {PointerGuard};
