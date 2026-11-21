import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

import styles from './pointer-cloud-modal.css';
import {
    deleteCloud,
    downloadCloud,
    getCloudStatus,
    listCloud,
    renameCloud,
    uploadCloudProject
} from '../../lib/pointer-cloud';

const formatBytes = bytes => {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatDate = value => new Date(value).toLocaleString();

const toBase64 = buffer => {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return window.btoa(binary);
};

class PointerCloudModal extends React.Component {
    constructor (props) {
        super(props);
        this.mounted = false;
        this.state = {
            kind: 'project',
            loading: true,
            items: [],
            quota: null,
            valid: true,
            error: '',
            notice: '',
            busy: false
        };
        this.handleUpdated = () => this.load();
        this.loadSeq = 0;
        this.handleKeyDown = event => {
            if (event.key === 'Escape') this.props.onClose();
        };
        this.handleSwitchKind = this.handleSwitchKind.bind(this);
        this.handleReconnect = this.handleReconnect.bind(this);
        this.handleUpload = this.handleUpload.bind(this);
        this.handleDownload = this.handleDownload.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.handleRename = this.handleRename.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        window.addEventListener('pointere-cloud-updated', this.handleUpdated);
        window.addEventListener('keydown', this.handleKeyDown, true);
        this.load();
    }

    componentWillUnmount () {
        this.mounted = false;
        window.removeEventListener('pointere-cloud-updated', this.handleUpdated);
        window.removeEventListener('keydown', this.handleKeyDown, true);
    }

    load () {
        const requestId = ++this.loadSeq;
        const kind = this.state.kind;
        this.setState({loading: true, error: '', notice: ''});
        return Promise.all([
            getCloudStatus(),
            listCloud(kind)
        ]).then(([status, list]) => {
            if (!this.mounted || requestId !== this.loadSeq) return;
            this.setState({
                loading: false,
                items: list.projects || [],
                quota: status.quota,
                valid: status.license.valid
            });
        }).catch(error => {
            if (!this.mounted || requestId !== this.loadSeq) return;
            this.setState({loading: false, error: error.message});
        });
    }

    handleSwitchKind (kind) {
        if (kind === this.state.kind) return;
        this.setState({kind, items: [], notice: '', error: ''}, () => this.load());
    }

    handleReconnect () {
        if (this.state.busy || this.state.loading) return;
        localStorage.removeItem('pointer.cloud.token');
        this.load();
    }

    handleUpload () {
        if (this.state.busy) return;
        this.setState({busy: true, error: '', notice: ''});
        uploadCloudProject(this.props.vm, this.props.projectTitle || '未命名作品')
            .then(result => {
                if (this.props.onNotice) this.props.onNotice(`作品「${result.project.title}」已上传到云`);
                return this.load().then(() => {
                    if (this.mounted) this.setState({notice: `作品「${result.project.title}」已上传到云`});
                });
            })
            .catch(error => {
                if (this.mounted) this.setState({error: error.message});
            })
            .then(() => {
                if (this.mounted) this.setState({busy: false});
            });
    }

    handleDownload (item) {
        if (this.state.busy) return;
        this.setState({busy: true, error: '', notice: ''});
        downloadCloud(item.id)
            .then(blob => {
                if (window.pointerDesktop && typeof window.pointerDesktop.saveProjectAs === 'function') {
                    return blob.arrayBuffer()
                        .then(buffer => window.pointerDesktop.saveProjectAs(
                            `${item.title}.sb3`,
                            toBase64(buffer)
                        ))
                        .then(result => {
                            if (!result || result.canceled) return null;
                            if (!result.ok) throw new Error(result.error || '保存失败');
                            return result.name;
                        });
                }
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `${item.title}.sb3`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 20000);
                return `${item.title}.sb3`;
            })
            .then(name => {
                if (this.mounted && name) this.setState({notice: `已保存「${name}」`});
            })
            .catch(error => {
                if (this.mounted) this.setState({error: error.message});
            })
            .then(() => {
                if (this.mounted) this.setState({busy: false});
            });
    }

    handleDelete (item) {
        if (this.state.busy) return;
        if (!window.confirm(`删除云端的「${item.title}」？`)) return;
        this.setState({busy: true, error: '', notice: ''});
        deleteCloud(item.id)
            .then(() => this.load().then(() => {
                if (this.mounted) this.setState({notice: `已删除「${item.title}」`});
            }))
            .catch(error => {
                if (this.mounted) this.setState({error: error.message});
            })
            .then(() => {
                if (this.mounted) this.setState({busy: false});
            });
    }

    handleRename (item) {
        if (this.state.busy) return;
        const title = window.prompt('新的名称', item.title);
        if (title === null) return;
        const next = title.trim();
        if (!next || next === item.title) return;
        this.setState({busy: true, error: '', notice: ''});
        renameCloud(item.id, next)
            .then(() => this.load().then(() => {
                if (this.mounted) this.setState({notice: `已重命名为「${next}」`});
            }))
            .catch(error => {
                if (this.mounted) this.setState({error: error.message});
            })
            .then(() => {
                if (this.mounted) this.setState({busy: false});
            });
    }

    render () {
        const {loading, items, quota, valid, error, notice, busy, kind} = this.state;
        const used = quota ? quota.usedBytes : 0;
        const total = quota ? quota.quotaBytes : 0;
        const percent = total ? Math.min(100, (used / total) * 100) : 0;

        return ReactDOM.createPortal(
            <div
                className={styles.overlay}
                role="dialog"
                aria-modal="true"
                aria-label="云空间"
            >
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <div>
                            <strong>云空间</strong>
                            <span>
                                云端 .sb3 文件{valid ? '' : ' · 当前额度不可用，仅可下载'}
                            </span>
                        </div>
                        <button
                            className={styles.close}
                            type="button"
                            onClick={this.props.onClose}
                            aria-label="返回编辑器"
                        >
                            ×
                        </button>
                    </div>

                    <div className={styles.content}>
                        <div className={styles.tabs}>
                            <button
                                className={kind === 'project' ? styles.tabActive : styles.tab}
                                type="button"
                                onClick={() => this.handleSwitchKind('project')}
                            >
                                作品
                            </button>
                            <button
                                className={kind === 'sprite' ? styles.tabActive : styles.tab}
                                type="button"
                                onClick={() => this.handleSwitchKind('sprite')}
                            >
                                角色
                            </button>
                            <span className={styles.spacer} />
                            <span className={styles.count}>
                                {loading ? '正在加载…' : `${items.length} 个`}
                            </span>
                            <button
                                className={styles.refresh}
                                type="button"
                                onClick={() => this.load()}
                                disabled={loading || busy}
                            >
                                刷新
                            </button>
                            <button
                                className={styles.refresh}
                                type="button"
                                onClick={this.handleReconnect}
                                disabled={loading || busy}
                                title="按当前 PointerE 登录重新连接云空间"
                            >
                                重新连接
                            </button>
                        </div>

                        <div className={styles.quota}>
                            <div className={styles.quotaHead}>
                                <span>存储空间</span>
                                <span>{quota ? `${formatBytes(used)} / ${formatBytes(total)}` : '— / —'}</span>
                            </div>
                            <div className={styles.quotaBar}>
                                <div
                                    className={styles.quotaFill}
                                    style={{width: `${percent.toFixed(1)}%`}}
                                />
                            </div>
                        </div>

                        <div className={styles.actions}>
                            {kind === 'project' ? (
                                <button
                                    className={styles.primary}
                                    type="button"
                                    onClick={this.handleUpload}
                                    disabled={busy || loading || !valid}
                                >
                                    上传当前作品
                                </button>
                            ) : (
                                <span className={styles.hint}>在角色上右键 → “上传到云”</span>
                            )}
                            <span className={styles.spacer} />
                            <span className={styles.hint}>仅支持 .sb3</span>
                        </div>

                        {error ? <div className={styles.error}>{error}</div> : null}
                        {notice ? <div className={styles.notice}>{notice}</div> : null}

                        {loading ? (
                            <div className={styles.empty}>正在加载…</div>
                        ) : items.length === 0 ? (
                            <div className={styles.empty}>
                                {kind === 'project' ? '还没有云端作品，点上方按钮上传。' : '还没有云端角色，右键角色上传。'}
                            </div>
                        ) : (
                            <ul className={styles.list}>
                                {items.map(item => (
                                    <li key={item.id} className={styles.item}>
                                        <div className={styles.itemInfo}>
                                            <strong>{item.title}</strong>
                                            <span>
                                                {item.kind === 'sprite' && item.spriteName ?
                                                    `角色：${item.spriteName} · ` : ''}
                                                {formatBytes(item.size)} · {formatDate(item.updatedAt)}
                                            </span>
                                        </div>
                                        <div className={styles.itemActions}>
                                            <button
                                                className={styles.smallButton}
                                                type="button"
                                                onClick={() => this.handleDownload(item)}
                                                disabled={busy}
                                            >
                                                下载
                                            </button>
                                            <button
                                                className={styles.smallButton}
                                                type="button"
                                                onClick={() => this.handleRename(item)}
                                                disabled={busy}
                                            >
                                                重命名
                                            </button>
                                            <button
                                                className={styles.danger}
                                                type="button"
                                                onClick={() => this.handleDelete(item)}
                                                disabled={busy}
                                            >
                                                删除
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        );
    }
}

PointerCloudModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onNotice: PropTypes.func,
    projectTitle: PropTypes.string,
    vm: PropTypes.shape({
        saveProjectSb3: PropTypes.func,
        saveProjectSb3DontZip: PropTypes.func,
        toJSON: PropTypes.func
    }).isRequired
};

export default PointerCloudModal;
