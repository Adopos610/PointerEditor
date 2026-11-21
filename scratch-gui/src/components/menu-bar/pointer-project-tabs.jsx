import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {intlShape} from 'react-intl';

import defaultProject from '../../lib/default-project';
import {uploadCloudSprite} from '../../lib/pointer-cloud';
import PointerCloudModal from './pointer-cloud-modal.jsx';
import styles from './pointer-project-tabs.css';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const AUTO_VERSION_INTERVAL = 5 * 60 * 1000;

const toBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return window.btoa(binary);
};

const toSafeFileName = name => {
    const base = String(name || '未命名作品')
        .replace(INVALID_FILENAME_CHARS, '_')
        .replace(/\.sb[23]?$/i, '')
        .trim()
        .slice(0, 80);
    return base || '未命名作品';
};

const getBlankProject = intl => {
    try {
        const assets = defaultProject((message, values) => intl.formatMessage(message, values));
        const project = assets.find(asset => asset.assetType === 'Project');
        return project ? project.data : null;
    } catch (error) {
        return null;
    }
};

class PointerProjectTabs extends React.Component {
    constructor (props) {
        super(props);
        const title = props.projectTitle || '未命名作品';
        const firstId = 'tab_1';
        this.state = {
            tabs: [{id: firstId, title, data: null, versions: []}],
            activeId: firstId,
            editingTitle: title,
            busy: false,
            busyLabel: '',
            notice: '',
            error: '',
            historyOpen: false,
            cloudOpen: false,
            dirty: false,
            lastAutoSaveAt: 0
        };
        this.seq = 1;
        this.loadingTab = false;
        this.autoVersionTimer = null;
        this.blankProject = getBlankProject(props.intl);
        this.commitTitle = this.commitTitle.bind(this);
        this.handleTitleChange = this.handleTitleChange.bind(this);
        this.handleTitleBlur = this.handleTitleBlur.bind(this);
        this.handleTitleKeyDown = this.handleTitleKeyDown.bind(this);
        this.handleNewTab = this.handleNewTab.bind(this);
        this.handleSwitchTab = this.handleSwitchTab.bind(this);
        this.handleCloseTab = this.handleCloseTab.bind(this);
        this.handleOpenHistory = this.handleOpenHistory.bind(this);
        this.handleSaveVersion = this.handleSaveVersion.bind(this);
        this.handleRestoreVersion = this.handleRestoreVersion.bind(this);
        this.handleRestoreVersionToNewTab = this.handleRestoreVersionToNewTab.bind(this);
        this.handleOpenRestorePoints = this.handleOpenRestorePoints.bind(this);
        this.handleProjectChanged = this.handleProjectChanged.bind(this);
        this.handleCloudSpriteUpload = this.handleCloudSpriteUpload.bind(this);
        this.handleExternalOpenCloud = this.handleExternalOpenCloud.bind(this);
        this.showNotice = this.showNotice.bind(this);
        this.handleSaveAll = this.handleSaveAll.bind(this);
    }

    componentDidUpdate (prevProps) {
        if (prevProps.projectTitle !== this.props.projectTitle && !this.state.busy) {
            const title = this.props.projectTitle || '未命名作品';
            this.setState(previous => ({
                tabs: previous.tabs.map(tab => (
                    tab.id === previous.activeId ? {...tab, title} : tab
                )),
                editingTitle: title
            }));
        }
    }

    componentDidMount () {
        this.handleExternalNewTab = () => this.handleNewTab();
        this.handleExternalSaveAll = () => this.handleSaveAll();
        window.addEventListener('pointere-new-tab', this.handleExternalNewTab);
        window.addEventListener('pointere-save-all-tabs', this.handleExternalSaveAll);
        window.addEventListener('pointere-cloud-upload-sprite', this.handleCloudSpriteUpload);
        window.addEventListener('pointere-cloud-open', this.handleExternalOpenCloud);
        if (this.props.vm && typeof this.props.vm.on === 'function') {
            this.props.vm.on('PROJECT_CHANGED', this.handleProjectChanged);
        }
        this.autoVersionTimer = window.setInterval(() => {
            if (!this.state.dirty || this.state.busy || this.loadingTab) return;
            this.saveActiveTab(true, 'auto').catch(error => {
                this.setState({error: error.message});
            });
        }, AUTO_VERSION_INTERVAL);
    }

    componentWillUnmount () {
        window.removeEventListener('pointere-new-tab', this.handleExternalNewTab);
        window.removeEventListener('pointere-save-all-tabs', this.handleExternalSaveAll);
        window.removeEventListener('pointere-cloud-upload-sprite', this.handleCloudSpriteUpload);
        window.removeEventListener('pointere-cloud-open', this.handleExternalOpenCloud);
        if (this.props.vm && typeof this.props.vm.off === 'function') {
            this.props.vm.off('PROJECT_CHANGED', this.handleProjectChanged);
        }
        if (this.autoVersionTimer) {
            window.clearInterval(this.autoVersionTimer);
            this.autoVersionTimer = null;
        }
        if (this.noticeTimer) window.clearTimeout(this.noticeTimer);
    }

    handleProjectChanged () {
        if (this.loadingTab || this.state.busy) return;
        if (!this.state.dirty) this.setState({dirty: true});
    }

    getActiveTab () {
        return this.state.tabs.find(tab => tab.id === this.state.activeId) || this.state.tabs[0];
    }

    saveActiveTab (recordVersion = true, source = 'auto') {
        const vm = this.props.vm;
        if (!vm || typeof vm.saveProjectSb3 !== 'function') return Promise.resolve();
        return vm.saveProjectSb3('arraybuffer').then(data => (
            new Promise(resolve => {
                this.setState(previous => ({
                    tabs: previous.tabs.map(tab => {
                        if (tab.id !== previous.activeId) return tab;
                        const versions = recordVersion ? [{
                            id: `version_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                            at: Date.now(),
                            title: previous.editingTitle || tab.title,
                            source,
                            data
                        }, ...(tab.versions || [])].slice(0, 12) : (tab.versions || []);
                        return {...tab, data, versions};
                    }),
                    dirty: recordVersion ? false : previous.dirty,
                    lastAutoSaveAt: recordVersion ? Date.now() : previous.lastAutoSaveAt
                }), resolve);
            })
        ));
    }

    loadTab (tab) {
        const vm = this.props.vm;
        const data = tab.data || this.blankProject;
        if (!data) return Promise.reject(new Error('无法创建空白项目'));
        this.loadingTab = true;
        vm.quit();
        return vm.loadProject(data).then(() => {
            if (vm.renderer) vm.renderer.draw();
            this.props.onSetProjectTitle(tab.title);
            this.props.onProjectUnchanged();
            this.loadingTab = false;
            this.setState({
                activeId: tab.id,
                editingTitle: tab.title,
                busy: false,
                error: '',
                dirty: false,
                lastAutoSaveAt: 0
            });
            if (this.props.onTabChange) this.props.onTabChange();
        }).catch(error => {
            this.loadingTab = false;
            throw error;
        });
    }

    handleSwitchTab (tabId) {
        if (this.state.busy || tabId === this.state.activeId) return;
        const target = this.state.tabs.find(tab => tab.id === tabId);
        if (!target) return;
        this.setState({busy: true});
        this.saveActiveTab()
            .then(() => this.loadTab(target))
            .catch(error => this.setState({busy: false, error: error.message}));
    }

    handleNewTab () {
        if (this.state.busy) return;
        const tab = {
            id: `tab_${++this.seq}`,
            title: '未命名作品',
            data: this.blankProject,
            versions: []
        };
        this.setState({busy: true});
        this.saveActiveTab()
            .then(() => {
                if (!this.blankProject) throw new Error('无法创建空白项目');
                this.setState(previous => ({tabs: previous.tabs.concat(tab)}), () => {
                    this.props.onSetProjectTitle(tab.title);
                    this.loadTab(tab);
                });
            })
            .catch(error => this.setState({busy: false, error: error.message}));
    }

    handleCloseTab (tabId, event) {
        event.stopPropagation();
        if (this.state.busy) return;
        if (!window.confirm('关闭这个标签页？未保存到文件的内容会丢失。')) return;
        const tabs = this.state.tabs.filter(tab => tab.id !== tabId);
        if (tabId !== this.state.activeId) {
            this.setState({tabs});
            return;
        }
        if (!tabs.length) {
            const replacement = {
                id: `tab_${++this.seq}`,
                title: '未命名作品',
                data: this.blankProject,
                versions: []
            };
            this.setState({tabs: [replacement], busy: true}, () => this.loadTab(replacement));
            return;
        }
        const currentIndex = this.state.tabs.findIndex(tab => tab.id === tabId);
        const next = tabs[Math.min(currentIndex, tabs.length - 1)];
        this.setState({tabs, busy: true}, () => this.loadTab(next));
    }

    handleTitleChange (event) {
        this.setState({editingTitle: event.target.value});
    }

    commitTitle () {
        const title = (this.state.editingTitle || '').trim().slice(0, 100) || '未命名作品';
        this.setState(previous => ({
            tabs: previous.tabs.map(tab => (
                tab.id === previous.activeId ? {...tab, title} : tab
            )),
            editingTitle: title
        }));
        if (title !== this.props.projectTitle) this.props.onSetProjectTitle(title);
    }

    handleTitleBlur () {
        this.commitTitle();
    }

    handleTitleKeyDown (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.setState({editingTitle: this.getActiveTab().title}, () => event.currentTarget.blur());
        }
    }

    handleOpenHistory () {
        if (this.state.busy) return;
        this.setState({historyOpen: true});
    }

    handleSaveVersion () {
        if (this.state.busy) return;
        this.setState({busy: true});
        this.saveActiveTab(true, 'manual')
            .then(() => this.setState({busy: false, historyOpen: true}))
            .catch(error => this.setState({busy: false, error: error.message}));
    }

    handleRestoreVersion (version) {
        if (this.state.busy) return;
        if (!window.confirm('恢复到这个版本？当前标签页会先记录一次快照。')) return;
        this.setState({busy: true});
        this.loadingTab = true;
        this.saveActiveTab(true, 'manual')
            .then(() => this.props.vm.loadProject(version.data))
            .then(() => {
                const vm = this.props.vm;
                if (vm.renderer) vm.renderer.draw();
                this.props.onSetProjectTitle(version.title);
                this.loadingTab = false;
                this.setState(previous => ({
                    tabs: previous.tabs.map(tab => (
                        tab.id === previous.activeId ?
                            {...tab, data: version.data, title: version.title} : tab
                    )),
                    editingTitle: version.title,
                    historyOpen: false,
                    busy: false,
                    dirty: false,
                    error: ''
                }));
            })
            .catch(error => {
                this.loadingTab = false;
                this.setState({busy: false, error: error.message});
            });
    }

    handleRestoreVersionToNewTab (version) {
        if (this.state.busy) return;
        this.setState({busy: true});
        this.saveActiveTab(false)
            .then(() => {
                const tab = {
                    id: `tab_${++this.seq}`,
                    title: `${version.title} · 恢复`,
                    data: version.data,
                    versions: []
                };
                this.setState(previous => ({
                    tabs: previous.tabs.concat(tab),
                    historyOpen: false
                }), () => this.loadTab(tab).catch(error => {
                    this.setState({busy: false, error: error.message});
                }));
            })
            .catch(error => this.setState({busy: false, error: error.message}));
    }

    handleOpenRestorePoints () {
        if (this.props.onOpenRestorePoints) this.props.onOpenRestorePoints();
    }

    handleExternalOpenCloud () {
        if (this.state.busy || this.loadingTab) {
            this.showNotice('正在切换标签页，请稍后再打开云空间');
            return;
        }
        this.setState({cloudOpen: true});
    }

    handleCloudSpriteUpload (event) {
        if (this.state.busy || this.loadingTab) {
            this.showNotice('正在切换标签页，请稍后再上传');
            return;
        }
        const detail = event && event.detail ? event.detail : {};
        if (!detail.targetId) return;
        this.showNotice('正在上传角色…');
        uploadCloudSprite(this.props.vm, detail.targetId, detail.spriteName)
            .then(result => {
                this.showNotice(`角色「${result.project.title}」已上传到云`);
                window.dispatchEvent(new CustomEvent('pointere-cloud-updated'));
            })
            .catch(error => this.showNotice(`上传失败：${error.message}`));
    }

    showNotice (text) {
        if (this.noticeTimer) window.clearTimeout(this.noticeTimer);
        this.setState({busy: false, busyLabel: '', notice: text});
        this.noticeTimer = window.setTimeout(() => {
            this.noticeTimer = null;
            this.setState({notice: ''});
        }, 8000);
    }

    downloadTabFile (name, data) {
        const blob = new Blob([data], {type: 'application/x-scratch-sb3'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${name}.sb3`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 20000);
    }

    handleSaveAll () {
        if (this.state.busy) return;
        this.commitTitle();
        this.setState({busy: true, busyLabel: '正在打包…', error: '', notice: ''});
        this.saveActiveTab(false)
            .then(() => {
                const activeTitle = (this.state.editingTitle || '').trim() || '未命名作品';
                const items = this.state.tabs
                    .map(tab => ({
                        name: toSafeFileName(tab.id === this.state.activeId ? activeTitle : tab.title),
                        data: tab.data || this.blankProject
                    }))
                    .filter(item => item.data && item.data.byteLength);
                if (!items.length) throw new Error('没有可保存的标签页');
                if (window.pointerDesktop && typeof window.pointerDesktop.saveProjectsBatch === 'function') {
                    return window.pointerDesktop.saveProjectsBatch(items.map(item => ({
                        name: item.name,
                        dataBase64: toBase64(item.data)
                    }))).then(result => {
                        if (!result || result.canceled) return null;
                        if (!result.ok) throw new Error(result.error || '批量保存失败');
                        return result;
                    });
                }
                items.forEach((item, index) => {
                    window.setTimeout(() => this.downloadTabFile(item.name, item.data), index * 350);
                });
                this.showNotice(`已开始下载 ${items.length} 个作品`);
                return null;
            })
            .then(result => {
                if (!result) {
                    this.setState({busy: false, busyLabel: ''});
                    return;
                }
                const failedCount = (result.failed || []).length;
                this.showNotice(failedCount ?
                    `已保存 ${result.saved.length} 个作品，${failedCount} 个失败` :
                    `已保存 ${result.saved.length} 个作品到所选文件夹`);
            })
            .catch(error => this.setState({busy: false, busyLabel: '', error: error.message}));
    }

    renderHistory () {
        if (!this.state.historyOpen) return null;
        const active = this.getActiveTab();
        const versions = (active && active.versions) || [];
        return ReactDOM.createPortal(
            <div className={styles.historyOverlay} role="dialog" aria-modal="true">
                <div className={styles.historyPanel}>
                    <div className={styles.historyHead}>
                        <div>
                            <strong>版本迭代记录</strong>
                            <span>{active ? active.title : ''} · 最近 {versions.length} 个快照 · 自动记录每 5 分钟</span>
                        </div>
                        <button
                            type="button"
                            className={styles.close}
                            onClick={() => this.setState({historyOpen: false})}
                            aria-label="关闭版本记录"
                        >
                            ×
                        </button>
                    </div>
                    <div className={styles.historyActions}>
                        <button type="button" className={styles.primarySmall} onClick={this.handleSaveVersion}>
                            保存当前版本
                        </button>
                        <button type="button" className={styles.secondarySmall} onClick={this.handleOpenRestorePoints}>
                            持久自动备份
                        </button>
                        <span>切换标签页、新建标签和每 5 分钟会自动记录</span>
                    </div>
                    {versions.length ? (
                        <ul className={styles.historyList}>
                            {versions.map(version => (
                                <li key={version.id}>
                                    <div>
                                        <strong>{version.title}</strong>
                                        <span>
                                            {version.source === 'manual' ? '手动' : '自动'} ·{' '}
                                            {new Date(version.at).toLocaleString()} ·{' '}
                                            {(version.data.byteLength / 1024).toFixed(0)} KB
                                        </span>
                                    </div>
                                    <div className={styles.versionActions}>
                                        <button
                                            type="button"
                                            className={styles.historyRestore}
                                            onClick={() => this.handleRestoreVersion(version)}
                                            disabled={this.state.busy}
                                        >
                                            恢复
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.historyRestoreNew}
                                            onClick={() => this.handleRestoreVersionToNewTab(version)}
                                            disabled={this.state.busy}
                                        >
                                            新标签
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.historyEmpty}>还没有版本快照。保存当前版本，或切换一次标签页后回来。</p>
                    )}
                    {this.state.error ? <p className={styles.historyError}>{this.state.error}</p> : null}
                </div>
            </div>,
            document.body
        );
    }

    render () {
        const {tabs, activeId, editingTitle, busy, busyLabel, notice, error, dirty, lastAutoSaveAt} = this.state;
        return (
            <React.Fragment>
            <div className={styles.tabsWrap}>
                <div className={styles.tabs} role="tablist" aria-label="项目标签页">
                    {tabs.map(tab => {
                        const active = tab.id === activeId;
                        return (
                            <div
                                key={tab.id}
                                className={active ? styles.tabActive : styles.tab}
                                role="tab"
                                aria-selected={active}
                            >
                                {active ? (
                                    <input
                                        className={styles.tabInput}
                                        value={editingTitle}
                                        maxLength="100"
                                        spellCheck={false}
                                        disabled={busy}
                                        onChange={this.handleTitleChange}
                                        onBlur={this.handleTitleBlur}
                                        onKeyDown={this.handleTitleKeyDown}
                                        aria-label="项目名称"
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.tabLabel}
                                        onClick={() => this.handleSwitchTab(tab.id)}
                                        disabled={busy}
                                    >
                                        {tab.title}
                                    </button>
                                )}
                                {active && dirty ? (
                                    <span
                                        className={styles.dirtyDot}
                                        title="有未记录到版本的改动"
                                    />
                                ) : null}
                                <button
                                    type="button"
                                    className={styles.tabClose}
                                    onClick={event => this.handleCloseTab(tab.id, event)}
                                    disabled={busy}
                                    aria-label="关闭标签页"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
                <button
                    type="button"
                    className={styles.tabAdd}
                    onClick={this.handleNewTab}
                    disabled={busy}
                    title="新建标签页"
                    aria-label="新建标签页"
                >
                    ＋
                </button>
                <button
                    type="button"
                    className={styles.batchButton}
                    onClick={this.handleSaveAll}
                    disabled={busy}
                    title="批量保存所有标签页到电脑"
                    aria-label="批量保存所有标签页到电脑"
                >
                    全部保存
                </button>
                <button
                    type="button"
                    className={styles.historyButton}
                    onClick={this.handleOpenHistory}
                    disabled={busy}
                    title="版本迭代记录"
                    aria-label="版本迭代记录"
                >
                    版本
                </button>
                <button
                    type="button"
                    className={styles.historyButton}
                    onClick={this.handleOpenRestorePoints}
                    title="打开持久自动备份，可跨重启恢复"
                    aria-label="打开持久自动备份"
                >
                    自动备份
                </button>
                {busy ? <span className={styles.status}>{busyLabel || '切换中…'}</span> : null}
                {!busy && notice ? <span className={styles.notice}>{notice}</span> : null}
                {!busy && !notice ? (
                    <span className={styles.autoStatus} title="自动记录每 5 分钟">
                        {dirty ? '有未记录改动' : lastAutoSaveAt ?
                            `已记录版本 ${new Date(lastAutoSaveAt).toLocaleTimeString()}` :
                            '自动记录已开启'}
                    </span>
                ) : null}
                {error ? <span className={styles.error} title={error}>失败</span> : null}
            </div>
            {this.renderHistory()}
            {this.state.cloudOpen ? (
                <PointerCloudModal
                    vm={this.props.vm}
                    projectTitle={editingTitle || (this.getActiveTab() && this.getActiveTab().title) || '未命名作品'}
                    onClose={() => this.setState({cloudOpen: false})}
                    onNotice={this.showNotice}
                />
            ) : null}
            </React.Fragment>
        );
    }
}

PointerProjectTabs.propTypes = {
    intl: intlShape.isRequired,
    onOpenRestorePoints: PropTypes.func,
    onProjectUnchanged: PropTypes.func,
    onSetProjectTitle: PropTypes.func.isRequired,
    onTabChange: PropTypes.func,
    projectTitle: PropTypes.string,
    vm: PropTypes.shape({
        loadProject: PropTypes.func,
        quit: PropTypes.func,
        renderer: PropTypes.object,
        saveProjectSb3: PropTypes.func
    }).isRequired
};

export default PointerProjectTabs;
