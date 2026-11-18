import classNames from 'classnames';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import bowser from 'bowser';
import React from 'react';

import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import CommunityButton from './community-button.jsx';
import ShareButton from './share-button.jsx';
import {ComingSoonTooltip} from '../coming-soon/coming-soon.jsx';
import Divider from '../divider/divider.jsx';
import SaveStatus from './save-status.jsx';
import ProjectWatcher from '../../containers/project-watcher.jsx';
import MenuBarMenu from './menu-bar-menu.jsx';
import MenuLabel from './tw-menu-label.jsx';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import AuthorInfo from './author-info.jsx';
import SB3Downloader from '../../containers/sb3-downloader.jsx';
import DeletionRestorer from '../../containers/deletion-restorer.jsx';
import TurboMode from '../../containers/turbo-mode.jsx';
import MenuBarHOC from '../../containers/menu-bar-hoc.jsx';
import SettingsMenu from './settings-menu.jsx';

import FramerateChanger from '../../containers/tw-framerate-changer.jsx';
import ChangeUsername from '../../containers/tw-change-username.jsx';
import CloudVariablesToggler from '../../containers/tw-cloud-toggler.jsx';
import TWSaveStatus from './tw-save-status.jsx';
import TWNews from './tw-news.jsx';

import {openTipsLibrary, openSettingsModal, openRestorePointModal} from '../../reducers/modals';
import {setPlayer} from '../../reducers/mode';
import {
    isTimeTravel220022BC,
    isTimeTravel1920,
    isTimeTravel1990,
    isTimeTravel2020,
    isTimeTravelNow,
    setTimeTravel
} from '../../reducers/time-travel';
import {
    autoUpdateProject,
    getIsUpdating,
    getIsShowingProject,
    manualUpdateProject,
    requestNewProject,
    remixProject,
    saveProjectAsCopy
} from '../../reducers/project-state';
import {
    openAboutMenu,
    closeAboutMenu,
    aboutMenuOpen,
    openAccountMenu,
    closeAccountMenu,
    accountMenuOpen,
    openFileMenu,
    closeFileMenu,
    fileMenuOpen,
    openEditMenu,
    closeEditMenu,
    editMenuOpen,
    openLoginMenu,
    closeLoginMenu,
    loginMenuOpen,
    openModeMenu,
    closeModeMenu,
    modeMenuOpen,
    settingsMenuOpen,
    openSettingsMenu,
    closeSettingsMenu,
    errorsMenuOpen,
    openErrorsMenu,
    closeErrorsMenu
} from '../../reducers/menus';
import {setFileHandle} from '../../reducers/tw.js';
import {setProjectTitle} from '../../reducers/project-title';
import {setProjectUnchanged} from '../../reducers/project-changed';

import collectMetadata from '../../lib/collect-metadata';

import styles from './menu-bar.css';

import helpIcon from '../../lib/assets/icon--tutorials.svg';
import mystuffIcon from './icon--mystuff.png';
import profileIcon from './icon--profile.png';
import remixIcon from './icon--remix.svg';
import dropdownCaret from './dropdown-caret.svg';
import aboutIcon from './icon--about.svg';
import fileIcon from './icon--file.svg';
import editIcon from './icon--edit.svg';
import addonsIcon from './addons.svg';
import errorIcon from './tw-error.svg';
import cloudIcon from './pointer-cloud.svg';

import ninetiesLogo from './nineties_logo.svg';
import catLogo from './cat_logo.svg';
import prehistoricLogo from './prehistoric-logo.svg';
import oldtimeyLogo from './oldtimey-logo.svg';
import pointerLogo from './pointer-logo.png';

import sharedMessages from '../../lib/shared-messages';

import SeeInsideButton from './tw-see-inside.jsx';
import PointerPublishModal from './pointer-publish-modal.jsx';
import PointerCollabModal from './pointer-collab-modal.jsx';
import PointerAccountCenter from './pointer-account-center.jsx';
import PointerPeAgent from './pointer-peagent.jsx';
import PointerCloudNotices from './pointer-cloud-notices.jsx';
import PointerAboutModal from './pointer-about-modal.jsx';
import PointerTodoBoard from './pointer-todo-board.jsx';
import {getAccount, fetchPointerPoints, claimDailyCodePoints} from '../../lib/pointer-account';
import {applyPayloadToEditor, readCrossWindowPayload} from '../../lib/pointer-cross-window';
import {notScratchDesktop} from '../../lib/isScratchDesktop.js';
import {APP_NAME} from '../../lib/brand.js';

const ariaMessages = defineMessages({
    tutorials: {
        id: 'gui.menuBar.tutorialsLibrary',
        defaultMessage: 'Tutorials',
        description: 'accessibility text for the tutorials button'
    }
});

const twMessages = defineMessages({
    compileError: {
        id: 'tw.menuBar.compileError',
        defaultMessage: '{sprite}: {error}',
        description: 'Error message in error menu'
    }
});

const getProjectTitleFromFilename = filename => {
    if (!filename) return '';
    const matches = String(filename).match(/^(.*)\.sb[23]?$/i);
    return matches ? matches[1].substring(0, 100) : '';
};

const toProjectBytes = data => {
    if (!data) return null;
    if (typeof data === 'string') {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data.type === 'Buffer' && Array.isArray(data.data)) return Uint8Array.from(data.data);
    if (Array.isArray(data)) return Uint8Array.from(data);
    return null;
};

const arrayBufferToBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const isDesktopShell = () => Boolean(window.pointerDesktop);

const fileMenuIcons = {
    new: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
        </svg>
    ),
    window: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
            <path d="M3.5 9h17" />
        </svg>
    ),
    tabs: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
            <path d="M3.5 9h17M8 5v4M14 5v4" />
        </svg>
    ),
    open: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 7.5h6l2 2h9v8.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18z" />
        </svg>
    ),
    save: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4.5h11l3.5 3.5v11.5H5z" />
            <path d="M8 4.5v6h7v-6M8 19.5v-6h8v6" />
        </svg>
    ),
    saveAs: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4.5h9l3 3v8.5H5z" />
            <path d="M17 15v5M14.5 17.5h5" />
        </svg>
    ),
    copy: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="1.8" />
            <path d="M5 15V5.8A1.8 1.8 0 0 1 6.8 4H16" />
        </svg>
    ),
    remix: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7h4v10h6" />
            <path d="M14 14l3 3-3 3" />
            <circle cx="7" cy="7" r="2.2" />
        </svg>
    ),
    package: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5l8 4.4v8.2L12 20.5l-8-4.4V7.9z" />
            <path d="M4 7.9l8 4.4 8-4.4M12 12.3v8.2" />
        </svg>
    ),
    restore: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7.5V12l3 2" />
        </svg>
    ),
    info: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 10.5v6M12 7.2v.6" />
        </svg>
    )
};

const FileMenuRow = ({icon, label, shortcut}) => (
    <span className={styles.fileMenuRow}>
        <span className={styles.fileMenuIcon}>{icon}</span>
        <span className={styles.fileMenuLabel}>{label}</span>
        {shortcut ? <span className={styles.fileMenuShortcut}>{shortcut}</span> : null}
    </span>
);

FileMenuRow.propTypes = {
    icon: PropTypes.node,
    label: PropTypes.node,
    shortcut: PropTypes.string
};

const MenuBarItemTooltip = ({
    children,
    className,
    enable,
    id,
    place = 'bottom'
}) => {
    if (enable) {
        return (
            <React.Fragment>
                {children}
            </React.Fragment>
        );
    }
    return (
        <ComingSoonTooltip
            className={classNames(styles.comingSoon, className)}
            place={place}
            tooltipClassName={styles.comingSoonTooltip}
            tooltipId={id}
        >
            {children}
        </ComingSoonTooltip>
    );
};


MenuBarItemTooltip.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    enable: PropTypes.bool,
    id: PropTypes.string,
    place: PropTypes.oneOf(['top', 'bottom', 'left', 'right'])
};

const MenuItemTooltip = ({id, isRtl, children, className}) => (
    <ComingSoonTooltip
        className={classNames(styles.comingSoon, className)}
        isRtl={isRtl}
        place={isRtl ? 'left' : 'right'}
        tooltipClassName={styles.comingSoonTooltip}
        tooltipId={id}
    >
        {children}
    </ComingSoonTooltip>
);

MenuItemTooltip.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    id: PropTypes.string,
    isRtl: PropTypes.bool
};

const AboutButton = props => (
    <Button
        className={classNames(styles.menuBarItem, styles.hoverable)}
        iconClassName={styles.aboutIcon}
        iconSrc={aboutIcon}
        onClick={props.onClick}
    />
);

AboutButton.propTypes = {
    onClick: PropTypes.func.isRequired
};

// Unlike <MenuItem href="">, this uses an actual <a>
const MenuItemLink = props => (
    <a
        href={props.href}
        rel="noreferrer"
        target="_blank"
        className={styles.menuItemLink}
    >
        <MenuItem>{props.children}</MenuItem>
    </a>
);

MenuItemLink.propTypes = {
    children: PropTypes.node.isRequired,
    href: PropTypes.string.isRequired
};

class MenuBar extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            publishOpen: false,
            collabOpen: false,
            collabActive: false,
            collabRoom: '',
            collabPeers: 0,
            collabNotice: '',
            cloudMenuOpen: false,
            accountOpen: false,
            accountUser: null,
            accountPoints: null,
            pointsToast: '',
            peagentOpen: false,
            todoOpen: false,
            assetToast: '',
            externalProject: null,
            aboutOpen: false
        };
        bindAll(this, [
            'handleClickSeeInside',
            'handleOpenCloud',
            'handleCloseCloud',
            'handleOpenPublish',
            'handleClosePublish',
            'handleOpenCollab',
            'handleCloseCollab',
            'handleCollabState',
            'handleOpenAccount',
            'handleCloseAccount',
            'handleAccountChanged',
            'handlePointsChanged',
            'handleProjectChanged',
            'handleOpenPeAgent',
            'handleClosePeAgent',
            'handleToggleTodo',
            'handleCrossDragOver',
            'handleCrossDrop',
            'showAssetToast',
            'handleClickNew',
            'handleClickNewTab',
            'handleClickNewWindow',
            'handleClickSaveAllTabs',
            'handleOpenAbout',
            'handleCloseAbout',
            'handleActiveTabChanged',
            'handleClickRemix',
            'handleClickSave',
            'handleClickSaveAsCopy',
            'handleClickPackager',
            'handleClickDesktopSettings',
            'handleClickRestorePoints',
            'handleClickSeeCommunity',
            'handleClickShare',
            'handleSetMode',
            'handleKeyPress',
            'handleRestoreOption',
            'getSaveToComputerHandler',
            'restoreOptionMessage',
            'queueExternalProject',
            'handleExternalProject',
            'handleDesktopOpenProject',
            'handleDesktopSave',
            'handleDesktopSaveAs'
        ]);
    }
    componentDidMount () {
        this.unmounted = false;
        document.addEventListener('keydown', this.handleKeyPress);
        window.addEventListener('pointere-account-changed', this.handleAccountChanged);
        window.addEventListener('pointere-points-changed', this.handlePointsChanged);
        window.addEventListener('pointere-active-tab-changed', this.handleActiveTabChanged);
        document.addEventListener('dragover', this.handleCrossDragOver, true);
        document.addEventListener('drop', this.handleCrossDrop, true);
        if (this.props.vm && typeof this.props.vm.on === 'function') {
            this.props.vm.on('PROJECT_CHANGED', this.handleProjectChanged);
        }
        if (window.pointerDesktop) {
            if (typeof window.pointerDesktop.onOpenProject === 'function') {
                this.removeOpenProjectListener = window.pointerDesktop.onOpenProject(this.queueExternalProject);
            }
            if (typeof window.pointerDesktop.getLaunchProject === 'function') {
                window.pointerDesktop.getLaunchProject()
                    .then(payload => {
                        if (!this.unmounted && payload) this.queueExternalProject(payload);
                    })
                    .catch(error => {
                        console.error('Failed to read launch project', error); // eslint-disable-line no-console
                    });
            }
        }
        this.codeActivityReady = false;
        this.codeActivityReadyTimer = setTimeout(() => {
            this.codeActivityReady = true;
        }, 4000);
        this.syncAccount();
    }
    componentDidUpdate () {
        if (this.pendingExternalProject && this.props.isShowingProject && !this.externalLoading) {
            const payload = this.pendingExternalProject;
            this.pendingExternalProject = null;
            this.handleExternalProject(payload);
        }
    }
    componentWillUnmount () {
        this.unmounted = true;
        document.removeEventListener('keydown', this.handleKeyPress);
        window.removeEventListener('pointere-account-changed', this.handleAccountChanged);
        window.removeEventListener('pointere-points-changed', this.handlePointsChanged);
        window.removeEventListener('pointere-active-tab-changed', this.handleActiveTabChanged);
        document.removeEventListener('dragover', this.handleCrossDragOver, true);
        document.removeEventListener('drop', this.handleCrossDrop, true);
        if (typeof this.removeOpenProjectListener === 'function') {
            this.removeOpenProjectListener();
            this.removeOpenProjectListener = null;
        }
        if (this.props.vm && typeof this.props.vm.removeListener === 'function') {
            this.props.vm.removeListener('PROJECT_CHANGED', this.handleProjectChanged);
        }
        clearTimeout(this.codeActivityReadyTimer);
        clearTimeout(this.dailyClaimTimer);
        clearTimeout(this.pointsToastTimer);
        clearTimeout(this.assetToastTimer);
    }
    syncAccount () {
        const account = getAccount();
        this.setState({accountUser: account ? account.user : null});
        if (!account || !account.token) {
            this.setState({accountPoints: null});
            return;
        }
        fetchPointerPoints(account.token)
            .then(summary => {
                if (this.unmounted) return;
                this.setState({accountPoints: summary.points});
            })
            .catch(() => {
                // Keep the cached identity; the account center exposes the detailed error.
            });
    }
    handleAccountChanged () {
        this.dailyClaimAttempted = false;
        this.syncAccount();
    }
    handlePointsChanged (event) {
        const points = event && event.detail ? event.detail.points : null;
        if (Number.isFinite(points)) this.setState({accountPoints: points});
    }
    handleProjectChanged () {
        if (this.unmounted || !this.codeActivityReady || this.dailyClaimAttempted) return;
        const account = getAccount();
        if (!account || !account.token) return;
        const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const key = 'pointere.dailyCodeClaim.' + today;
        if (localStorage.getItem(key)) return;
        this.dailyClaimAttempted = true;
        clearTimeout(this.dailyClaimTimer);
        this.dailyClaimTimer = setTimeout(() => {
            const current = getAccount();
            if (!current || !current.token) {
                this.dailyClaimAttempted = false;
                return;
            }
            claimDailyCodePoints(current.token)
                .then(result => {
                    localStorage.setItem(key, '1');
                    if (result.awarded && !this.unmounted) {
                        this.setState({
                            accountPoints: result.points,
                            pointsToast: '每日代码奖励 +' + result.amount + ' 积分'
                        });
                        clearTimeout(this.pointsToastTimer);
                        this.pointsToastTimer = setTimeout(() => {
                            this.setState({pointsToast: ''});
                        }, 4200);
                        window.dispatchEvent(new CustomEvent('pointere-points-changed', {
                            detail: {points: result.points}
                        }));
                    }
                })
                .catch(() => {
                    this.dailyClaimAttempted = false;
                });
        }, 2200);
    }
    handleOpenAccount () {
        this.setState({accountOpen: true, accountPoints: this.state.accountPoints});
    }
    handleCloseAccount () {
        this.setState({accountOpen: false});
        this.syncAccount();
    }
    handleOpenPeAgent () {
        this.setState({peagentOpen: true});
    }
    handleToggleTodo () {
        this.setState(previous => ({todoOpen: !previous.todoOpen}));
    }
    showAssetToast (assetToast) {
        clearTimeout(this.assetToastTimer);
        this.setState({assetToast});
        this.assetToastTimer = setTimeout(() => {
            if (!this.unmounted) this.setState({assetToast: ''});
        }, 4200);
    }
    handleCrossDragOver (event) {
        const types = event.dataTransfer && event.dataTransfer.types;
        if (types && Array.from(types).includes('application/x-pointere-token')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    }
    handleCrossDrop (event) {
        const types = event.dataTransfer && event.dataTransfer.types;
        if (!types || !Array.from(types).includes('application/x-pointere-token')) return;
        event.preventDefault();
        event.stopPropagation();
        readCrossWindowPayload(event.dataTransfer)
            .then(payload => {
                if (!payload) throw new Error('跨窗口素材已失效');
                return applyPayloadToEditor(this.props.vm, payload);
            })
            .then(result => {
                if (result && result.ok) this.showAssetToast(result.message);
            })
            .catch(error => this.showAssetToast(error.message || '跨窗口导入失败'));
    }
    handleClosePeAgent () {
        this.setState({peagentOpen: false});
    }
    handleClickNew () {
        // if the project is dirty, and user owns the project, we will autosave.
        // but if they are not logged in and can't save, user should consider
        // downloading or logging in first.
        // Note that if user is logged in and editing someone else's project,
        // they'll lose their work.
        const readyToReplaceProject = this.props.confirmReadyToReplaceProject(
            this.props.intl.formatMessage(sharedMessages.replaceProjectWarning)
        );
        this.props.onRequestCloseFile();
        if (readyToReplaceProject) {
            this.props.onClickNew(this.props.canSave && this.props.canCreateNew);
        }
        this.props.onRequestCloseFile();
    }
    handleClickNewWindow () {
        if (this.props.onClickNewWindow) {
            this.props.onClickNewWindow();
        } else if (window.pointerDesktop && typeof window.pointerDesktop.openNewWindow === 'function') {
            window.pointerDesktop.openNewWindow().catch(() => {});
        } else {
            window.open('editor.html', '_blank');
        }
        this.props.onRequestCloseFile();
    }
    handleClickNewTab () {
        this.props.onRequestCloseFile();
        window.dispatchEvent(new CustomEvent('pointere-new-tab'));
    }
    handleClickSaveAllTabs () {
        this.props.onRequestCloseFile();
        window.dispatchEvent(new CustomEvent('pointere-save-all-tabs'));
    }
    handleActiveTabChanged () {
        if (this.state.externalProject) this.setState({externalProject: null});
    }
    handleClickRemix () {
        this.props.onClickRemix();
        this.props.onRequestCloseFile();
    }
    queueExternalProject (payload) {
        if (!payload || !payload.path) return;
        if (this.props.isShowingProject) {
            this.handleExternalProject(payload);
        } else {
            this.pendingExternalProject = payload;
        }
    }
    handleExternalProject (payload) {
        if (!payload || !payload.path) return;
        if (this.externalLoading) {
            this.pendingExternalProject = payload;
            return;
        }
        const bytes = toProjectBytes(payload.dataBase64 || payload.data);
        if (!bytes) {
            this.showAssetToast('无法读取项目文件');
            return;
        }
        const ready = this.props.confirmReadyToReplaceProject(
            this.props.intl.formatMessage(sharedMessages.replaceProjectWarning)
        );
        if (!ready) return;
        this.props.onRequestCloseFile();
        this.externalLoading = true;
        this.props.vm.quit();
        this.props.vm.loadProject(bytes)
            .then(() => {
                const name = payload.name || String(payload.path).split(/[\\/]/).pop() || '未命名.sb3';
                const title = getProjectTitleFromFilename(name);
                if (title) this.props.onSetProjectTitle(title);
                if (this.props.vm.renderer) this.props.vm.renderer.draw();
                this.props.onProjectUnchanged();
                this.props.onSetFileHandle(null);
                if (!this.unmounted) {
                    this.setState({externalProject: {path: payload.path, name}});
                    this.showAssetToast('已打开 ' + name);
                }
            })
            .catch(error => {
                this.showAssetToast('打开失败：' + (error && error.message ? error.message : '文件无法解析'));
            })
            .then(() => {
                this.externalLoading = false;
                if (this.pendingExternalProject && !this.unmounted) {
                    const next = this.pendingExternalProject;
                    this.pendingExternalProject = null;
                    this.queueExternalProject(next);
                }
            });
    }
    handleDesktopOpenProject () {
        this.props.onRequestCloseFile();
        if (!window.pointerDesktop || typeof window.pointerDesktop.openProjectDialog !== 'function') {
            this.props.onStartSelectingFileUpload();
            return;
        }
        window.pointerDesktop.openProjectDialog()
            .then(payload => {
                if (payload) this.handleExternalProject(payload);
            })
            .catch(error => this.showAssetToast('打开失败：' + (error.message || error)));
    }
    handleDesktopSave () {
        const external = this.state.externalProject;
        if (!external || !/\.sb3$/i.test(external.path)) {
            this.handleDesktopSaveAs();
            return;
        }
        this.props.onRequestCloseFile();
        this.props.vm.saveProjectSb3('arraybuffer')
            .then(buffer => window.pointerDesktop.saveProject(external.path, arrayBufferToBase64(buffer)))
            .then(result => {
                if (!result || !result.ok) throw new Error((result && result.error) || '写入文件失败');
                this.props.onProjectUnchanged();
                this.showAssetToast('已保存到 ' + result.name);
            })
            .catch(error => this.showAssetToast('保存失败：' + (error.message || error)));
    }
    handleDesktopSaveAs () {
        this.props.onRequestCloseFile();
        const current = this.state.externalProject;
        const baseTitle = getProjectTitleFromFilename(current && current.name) ||
            this.props.projectTitle || 'PointerEditor 项目';
        this.props.vm.saveProjectSb3('arraybuffer')
            .then(buffer => window.pointerDesktop.saveProjectAs(`${baseTitle}.sb3`, arrayBufferToBase64(buffer)))
            .then(result => {
                if (!result || result.canceled) return;
                if (!result.ok) throw new Error(result.error || '写入文件失败');
                const title = getProjectTitleFromFilename(result.name);
                if (title) this.props.onSetProjectTitle(title);
                this.props.onProjectUnchanged();
                this.setState({externalProject: {path: result.path, name: result.name}});
                this.showAssetToast('已保存到 ' + result.name);
            })
            .catch(error => this.showAssetToast('保存失败：' + (error.message || error)));
    }
    handleClickSave () {
        this.props.onClickSave();
        this.props.onRequestCloseFile();
    }
    handleClickSaveAsCopy () {
        this.props.onClickSaveAsCopy();
        this.props.onRequestCloseFile();
    }
    handleClickPackager () {
        this.props.onClickPackager();
        this.props.onRequestCloseFile();
    }
    handleOpenCloud () {
        this.setState({cloudMenuOpen: true});
    }
    handleCloseCloud () {
        this.setState({cloudMenuOpen: false});
    }
    handleOpenAbout () {
        this.props.onRequestCloseFile();
        this.setState({aboutOpen: true});
    }
    handleCloseAbout () {
        this.setState({aboutOpen: false});
    }
    handleOpenPublish () {
        this.setState({publishOpen: true, cloudMenuOpen: false});
        this.props.onRequestCloseFile();
    }
    handleClosePublish () {
        this.setState({publishOpen: false});
    }
    handleOpenCollab () {
        this.setState({collabOpen: true, cloudMenuOpen: false, collabNotice: ''});
        this.props.onRequestCloseFile();
    }
    handleCloseCollab () {
        this.setState({collabOpen: false});
    }
    handleCollabState (info) {
        const next = info || {};
        this.setState({
            collabActive: Boolean(next.active),
            collabRoom: next.room || '',
            collabPeers: next.peers || 0,
            collabNotice: next.notice || ''
        });
    }
    handleClickDesktopSettings () {
        this.props.onClickDesktopSettings();
        this.props.onRequestCloseSettings();
    }
    handleClickRestorePoints () {
        this.props.onClickRestorePoints();
        this.props.onRequestCloseFile();
    }
    handleClickSeeCommunity (waitForUpdate) {
        if (this.props.shouldSaveBeforeTransition()) {
            this.props.autoUpdateProject(); // save before transitioning to project page
            waitForUpdate(true); // queue the transition to project page
        } else {
            waitForUpdate(false); // immediately transition to project page
        }
    }
    handleClickShare (waitForUpdate) {
        if (!this.props.isShared) {
            if (this.props.canShare) { // save before transitioning to project page
                this.props.onShare();
            }
            if (this.props.canSave) { // save before transitioning to project page
                this.props.autoUpdateProject();
                waitForUpdate(true); // queue the transition to project page
            } else {
                waitForUpdate(false); // immediately transition to project page
            }
        }
    }
    handleSetMode (mode) {
        return () => {
            // Turn on/off filters for modes.
            if (mode === '1920') {
                document.documentElement.style.filter = 'brightness(.9)contrast(.8)sepia(1.0)';
                document.documentElement.style.height = '100%';
            } else if (mode === '1990') {
                document.documentElement.style.filter = 'hue-rotate(40deg)';
                document.documentElement.style.height = '100%';
            } else {
                document.documentElement.style.filter = '';
                document.documentElement.style.height = '';
            }

            // Change logo for modes
            if (mode === '1990') {
                document.getElementById('logo_img').src = ninetiesLogo;
            } else if (mode === '2020') {
                document.getElementById('logo_img').src = catLogo;
            } else if (mode === '1920') {
                document.getElementById('logo_img').src = oldtimeyLogo;
            } else if (mode === '220022BC') {
                document.getElementById('logo_img').src = prehistoricLogo;
            } else {
                document.getElementById('logo_img').src = this.props.logo;
            }

            this.props.onSetTimeTravelMode(mode);
        };
    }
    handleRestoreOption (restoreFun) {
        return () => {
            restoreFun();
            this.props.onRequestCloseEdit();
        };
    }
    handleKeyPress (event) {
        const modifier = bowser.mac ? event.metaKey : event.ctrlKey;
        if (modifier) {
            if (event.key.toLowerCase() === 's') {
                if (isDesktopShell() && !this.props.canSave) {
                    if (event.shiftKey) {
                        this.handleDesktopSaveAs();
                    } else {
                        this.handleDesktopSave();
                    }
                } else {
                    this.props.handleSaveProject();
                }
                event.preventDefault();
            } else if (event.key.toLowerCase() === 'o') {
                event.preventDefault();
                if (isDesktopShell()) {
                    this.handleDesktopOpenProject();
                } else {
                    this.props.onStartSelectingFileUpload();
                }
            }
        }
    }
    getSaveToComputerHandler (downloadProjectCallback) {
        return () => {
            this.props.onRequestCloseFile();
            downloadProjectCallback();
            if (this.props.onProjectTelemetryEvent) {
                const metadata = collectMetadata(this.props.vm, this.props.projectTitle, this.props.locale);
                this.props.onProjectTelemetryEvent('projectDidSave', metadata);
            }
        };
    }
    restoreOptionMessage (deletedItem) {
        switch (deletedItem) {
        case 'Sprite':
            return (<FormattedMessage
                defaultMessage="Restore Sprite"
                description="Menu bar item for restoring the last deleted sprite."
                id="gui.menuBar.restoreSprite"
            />);
        case 'Sound':
            return (<FormattedMessage
                defaultMessage="Restore Sound"
                description="Menu bar item for restoring the last deleted sound."
                id="gui.menuBar.restoreSound"
            />);
        case 'Costume':
            return (<FormattedMessage
                defaultMessage="Restore Costume"
                description="Menu bar item for restoring the last deleted costume."
                id="gui.menuBar.restoreCostume"
            />);
        default: {
            return (<FormattedMessage
                defaultMessage="Restore"
                description="Menu bar item for restoring the last deleted item in its disabled state." /* eslint-disable-line max-len */
                id="gui.menuBar.restore"
            />);
        }
        }
    }
    handleClickSeeInside () {
        this.props.onClickSeeInside();
    }
    buildAboutMenu (onClickAbout) {
        if (!onClickAbout) {
            // hide the button
            return null;
        }
        if (typeof onClickAbout === 'function') {
            // make a button which calls a function
            return <AboutButton onClick={onClickAbout} />;
        }
        // assume it's an array of objects
        // each item must have a 'title' FormattedMessage and a 'handleClick' function
        // generate a menu with items for each object in the array
        return (
            <MenuLabel
                open={this.props.aboutMenuOpen}
                onOpen={this.props.onRequestOpenAbout}
                onClose={this.props.onRequestCloseAbout}
            >
                <img
                    className={styles.aboutIcon}
                    src={aboutIcon}
                    draggable={false}
                />
                <MenuBarMenu
                    className={classNames(styles.menuBarMenu)}
                    open={this.props.aboutMenuOpen}
                    place={this.props.isRtl ? 'right' : 'left'}
                >
                    {
                        onClickAbout.map(itemProps => (
                            <MenuItem
                                key={itemProps.title}
                                isRtl={this.props.isRtl}
                                onClick={this.wrapAboutMenuCallback(itemProps.onClick)}
                            >
                                {itemProps.title}
                            </MenuItem>
                        ))
                    }
                </MenuBarMenu>
            </MenuLabel>
        );
    }
    wrapAboutMenuCallback (callback) {
        return () => {
            callback();
            this.props.onRequestCloseAbout();
        };
    }
    render () {
        const saveNowMessage = (
            <FormattedMessage
                defaultMessage="Save now"
                description="Menu bar item for saving now"
                id="gui.menuBar.saveNow"
            />
        );
        const createCopyMessage = (
            <FormattedMessage
                defaultMessage="Save as a copy"
                description="Menu bar item for saving as a copy"
                id="gui.menuBar.saveAsCopy"
            />
        );
        const remixMessage = (
            <FormattedMessage
                defaultMessage="Remix"
                description="Menu bar item for remixing"
                id="gui.menuBar.remix"
            />
        );
        const newProjectMessage = (
            <FormattedMessage
                defaultMessage="New"
                description="Menu bar item for creating a new project"
                id="gui.menuBar.new"
            />
        );
        const remixButton = (
            <Button
                className={classNames(
                    styles.menuBarButton,
                    styles.remixButton
                )}
                iconClassName={styles.remixButtonIcon}
                iconSrc={remixIcon}
                onClick={this.handleClickRemix}
            >
                {remixMessage}
            </Button>
        );
        // Show the About button only if we have a handler for it (like in the desktop app)
        const aboutButton = this.buildAboutMenu(this.props.onClickAbout);
        const menuBar = (
            <Box
                className={classNames(
                    this.props.className,
                    styles.menuBar
                )}
            >
                <div className={styles.mainMenu}>
                    <div className={styles.brand}>
                        <span className={styles.brandBadge}>
                            <img
                                className={styles.brandLogo}
                                src={pointerLogo}
                                draggable={false}
                                alt={APP_NAME}
                            />
                        </span>
                        <span className={styles.brandName}>{APP_NAME}</span>
                    </div>
                    <div className={styles.fileGroup}>
                        {this.props.errors.length > 0 && <div>
                            <MenuLabel
                                open={this.props.errorsMenuOpen}
                                onOpen={this.props.onClickErrors}
                                onClose={this.props.onRequestCloseErrors}
                            >
                                <img
                                    src={errorIcon}
                                    draggable={false}
                                    width={20}
                                    height={20}
                                />
                                <img
                                    src={dropdownCaret}
                                    draggable={false}
                                    width={8}
                                    height={5}
                                />
                                <MenuBarMenu
                                    className={classNames(styles.menuBarMenu)}
                                    open={this.props.errorsMenuOpen}
                                    place={this.props.isRtl ? 'left' : 'right'}
                                >
                                    <MenuSection>
                                        <MenuItemLink href="https://scratch.mit.edu/users/GarboMuffin/#comments">
                                            <FormattedMessage
                                                defaultMessage="Some scripts encountered errors."
                                                description="Link in error menu"
                                                id="tw.menuBar.reportError1"
                                            />
                                        </MenuItemLink>
                                        <MenuItemLink href="https://scratch.mit.edu/users/GarboMuffin/#comments">
                                            <FormattedMessage
                                                defaultMessage="This is a bug. Please report it."
                                                description="Link in error menu"
                                                id="tw.menuBar.reportError2"
                                            />
                                        </MenuItemLink>
                                    </MenuSection>
                                    <MenuSection>
                                        {this.props.errors.map(({id, sprite, error}) => (
                                            <MenuItem key={id}>
                                                {this.props.intl.formatMessage(twMessages.compileError, {
                                                    sprite,
                                                    error
                                                })}
                                            </MenuItem>
                                        ))}
                                    </MenuSection>
                                </MenuBarMenu>
                            </MenuLabel>
                        </div>}
                        {(this.props.canChangeTheme || this.props.canChangeLanguage) && (<SettingsMenu
                            canChangeLanguage={this.props.canChangeLanguage}
                            canChangeTheme={this.props.canChangeTheme}
                            isRtl={this.props.isRtl}
                            onClickDesktopSettings={
                                this.props.onClickDesktopSettings &&
                                this.handleClickDesktopSettings
                            }
                            // eslint-disable-next-line react/jsx-no-bind
                            onOpenCustomSettings={
                                this.props.onClickAddonSettings &&
                                this.props.onClickAddonSettings.bind(null, 'editor-theme3')
                            }
                            onRequestClose={this.props.onRequestCloseSettings}
                            onRequestOpen={this.props.onClickSettings}
                            settingsMenuOpen={this.props.settingsMenuOpen}
                        />)}
                        {(this.props.canManageFiles) && (
                            <MenuLabel
                                open={this.props.fileMenuOpen}
                                onOpen={this.props.onClickFile}
                                onClose={this.props.onRequestCloseFile}
                            >
                                <img
                                    src={fileIcon}
                                    draggable={false}
                                    width={20}
                                    height={20}
                                />
                                <span className={styles.collapsibleLabel}>
                                    <FormattedMessage
                                        defaultMessage="File"
                                        description="Text for file dropdown menu"
                                        id="gui.menuBar.file"
                                    />
                                </span>
                                <img
                                    src={dropdownCaret}
                                    draggable={false}
                                    width={8}
                                    height={5}
                                />
                                <MenuBarMenu
                                    className={classNames(styles.menuBarMenu)}
                                    open={this.props.fileMenuOpen}
                                    place={this.props.isRtl ? 'left' : 'right'}
                                >
                                    <MenuItem
                                        isRtl={this.props.isRtl}
                                        onClick={this.handleClickNew}
                                    >
                                        <FileMenuRow icon={fileMenuIcons.new} label={newProjectMessage} />
                                    </MenuItem>
                                    <MenuItem
                                        isRtl={this.props.isRtl}
                                        onClick={this.handleClickNewTab}
                                    >
                                        <FileMenuRow icon={fileMenuIcons.tabs} label="新建标签页" />
                                    </MenuItem>
                                    <MenuItem
                                        isRtl={this.props.isRtl}
                                        onClick={this.handleClickNewWindow}
                                    >
                                        <FileMenuRow
                                            icon={fileMenuIcons.window}
                                            label={(
                                                <FormattedMessage
                                                    defaultMessage="New window"
                                                    // eslint-disable-next-line max-len
                                                    description="Creates another PointerEditor window for side-by-side work."
                                                    id="tw.menuBar.newWindow"
                                                />
                                            )}
                                        />
                                    </MenuItem>
                                    {(this.props.canSave || this.props.canCreateCopy || this.props.canRemix) && (
                                        <MenuSection>
                                            {this.props.canSave && (
                                                <MenuItem onClick={this.handleClickSave}>
                                                    <FileMenuRow icon={fileMenuIcons.save} label={saveNowMessage} />
                                                </MenuItem>
                                            )}
                                            {this.props.canCreateCopy && (
                                                <MenuItem onClick={this.handleClickSaveAsCopy}>
                                                    <FileMenuRow icon={fileMenuIcons.copy} label={createCopyMessage} />
                                                </MenuItem>
                                            )}
                                            {this.props.canRemix && (
                                                <MenuItem onClick={this.handleClickRemix}>
                                                    <FileMenuRow icon={fileMenuIcons.remix} label={remixMessage} />
                                                </MenuItem>
                                            )}
                                        </MenuSection>
                                    )}
                                    <MenuSection>
                                        <MenuItem
                                            onClick={isDesktopShell() ?
                                                this.handleDesktopOpenProject :
                                                this.props.onStartSelectingFileUpload}
                                        >
                                            <FileMenuRow
                                                icon={fileMenuIcons.open}
                                                label={this.props.intl.formatMessage(sharedMessages.loadFromComputerTitle)}
                                                shortcut="Ctrl+O"
                                            />
                                        </MenuItem>
                                        {!isDesktopShell() && (
                                            <SB3Downloader
                                                showSaveFilePicker={this.props.showSaveFilePicker}
                                            >
                                                {(_className, downloadProject, extended) => (
                                                    <React.Fragment>
                                                        {extended.available && (
                                                            <React.Fragment>
                                                                {extended.name !== null && (
                                                                    // eslint-disable-next-line max-len
                                                                    <MenuItem onClick={this.getSaveToComputerHandler(extended.saveToLastFile)}>
                                                                        <FormattedMessage
                                                                            defaultMessage="Save to {file}"
                                                                            // eslint-disable-next-line max-len
                                                                            description="Menu bar item to save project to an existing file on the user's computer"
                                                                            id="tw.saveTo"
                                                                            values={{
                                                                                file: extended.name
                                                                            }}
                                                                        />
                                                                    </MenuItem>
                                                                )}
                                                                {/* eslint-disable-next-line max-len */}
                                                                <MenuItem onClick={this.getSaveToComputerHandler(extended.saveAsNew)}>
                                                                    <FormattedMessage
                                                                        defaultMessage="Save as..."
                                                                        // eslint-disable-next-line max-len
                                                                        description="Menu bar item to select a new file to save the project as"
                                                                        id="tw.saveAs"
                                                                    />
                                                                </MenuItem>
                                                            </React.Fragment>
                                                        )}
                                                        {notScratchDesktop() && (
                                                            <MenuItem
                                                                onClick={this.getSaveToComputerHandler(downloadProject)}
                                                            >
                                                                {extended.available ? (
                                                                    <FormattedMessage
                                                                        defaultMessage="Save to separate file..."
                                                                        // eslint-disable-next-line max-len
                                                                        description="Download the project once, without being able to easily save to the same spot"
                                                                        id="tw.oldDownload"
                                                                    />
                                                                ) : (
                                                                    <FormattedMessage
                                                                        defaultMessage="Save to your computer"
                                                                        description="Menu bar item for downloading a project to your computer" // eslint-disable-line max-len
                                                                        id="gui.menuBar.downloadToComputer"
                                                                    />
                                                                )}
                                                            </MenuItem>
                                                        )}
                                                    </React.Fragment>
                                                )}
                                            </SB3Downloader>
                                        )}
                                    </MenuSection>
                                    {isDesktopShell() && (
                                        <MenuSection>
                                            <MenuItem onClick={this.handleDesktopSave}>
                                                <FileMenuRow
                                                    icon={fileMenuIcons.save}
                                                    label={this.state.externalProject &&
                                                    /\.sb3$/i.test(this.state.externalProject.path) ?
                                                        '保存到原文件' :
                                                        '保存到电脑…'}
                                                    shortcut="Ctrl+S"
                                                />
                                            </MenuItem>
                                            <MenuItem onClick={this.handleDesktopSaveAs}>
                                                <FileMenuRow
                                                    icon={fileMenuIcons.saveAs}
                                                    label="另存为…"
                                                    shortcut="Ctrl+Shift+S"
                                                />
                                            </MenuItem>
                                        </MenuSection>
                                    )}
                                    <MenuSection>
                                        <MenuItem onClick={this.handleClickSaveAllTabs}>
                                            <FileMenuRow
                                                icon={fileMenuIcons.tabs}
                                                label="批量保存所有标签页…"
                                            />
                                        </MenuItem>
                                        <MenuItem onClick={this.handleOpenAbout}>
                                            <FileMenuRow
                                                icon={fileMenuIcons.info}
                                                label="关于 PointerEditor"
                                            />
                                        </MenuItem>
                                    </MenuSection>
                                    {this.props.onClickPackager && (
                                        <MenuSection>
                                            <MenuItem
                                                onClick={this.handleClickPackager}
                                            >
                                                <FileMenuRow
                                                    icon={fileMenuIcons.package}
                                                    label={(
                                                        <FormattedMessage
                                                            defaultMessage="Package project"
                                                            // eslint-disable-next-line max-len
                                                            description="Menu bar item to open the current project in the packager"
                                                            id="tw.menuBar.package"
                                                        />
                                                    )}
                                                />
                                            </MenuItem>
                                        </MenuSection>
                                    )}
                                    <MenuSection>
                                        <MenuItem onClick={this.handleClickRestorePoints}>
                                            <FileMenuRow
                                                icon={fileMenuIcons.restore}
                                                label={(
                                                    <FormattedMessage
                                                        defaultMessage="Restore points"
                                                        description="Menu bar item to manage restore points"
                                                        id="tw.menuBar.restorePoints"
                                                    />
                                                )}
                                            />
                                        </MenuItem>
                                    </MenuSection>
                                </MenuBarMenu>
                            </MenuLabel>
                        )}
                        <MenuLabel
                            open={this.state.cloudMenuOpen}
                            onOpen={this.handleOpenCloud}
                            onClose={this.handleCloseCloud}
                        >
                            <img
                                src={cloudIcon}
                                draggable={false}
                                width={24}
                                height={24}
                            />
                            <span className={styles.collapsibleLabel}>
                                <FormattedMessage
                                    defaultMessage="云端"
                                    description="Text for cloud dropdown menu"
                                    id="pointer.menuBar.cloud"
                                />
                            </span>
                            <img
                                src={dropdownCaret}
                                draggable={false}
                                width={8}
                                height={5}
                            />
                            <MenuBarMenu
                                className={classNames(styles.menuBarMenu)}
                                open={this.state.cloudMenuOpen}
                                place={this.props.isRtl ? 'left' : 'right'}
                            >
                                <MenuSection>
                                    <MenuItem onClick={this.handleOpenPublish}>
                                        <FormattedMessage
                                            defaultMessage="发布到创客次元"
                                            description="Menu bar item to publish the project to the community"
                                            id="pointer.menuBar.publish"
                                        />
                                    </MenuItem>
                                    <MenuItem onClick={this.handleOpenCollab}>
                                        <FormattedMessage
                                            defaultMessage="在线协作"
                                            description="Menu bar item to open the online collaboration dialog"
                                            id="pointer.menuBar.collab"
                                        />
                                    </MenuItem>
                                </MenuSection>
                            </MenuBarMenu>
                        </MenuLabel>
                        <button
                            type="button"
                            className={classNames(styles.menuBarItem, styles.hoverable, styles.peagentMenuButton)}
                            onClick={this.handleOpenPeAgent}
                            title="PEAgent · Scratch 积木助手"
                        >
                            <svg
                                className={styles.peagentMenuIcon}
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    fill="currentColor"
                                    d="M11 2.5 12.9 8.1 18.5 10 12.9 11.9 11 17.5 9.1 11.9 3.5 10 9.1 8.1Z"
                                />
                                <path
                                    fill="currentColor"
                                    opacity="0.8"
                                    d="M18.7 2.2 19.5 4.5 21.8 5.3 19.5 6.1 18.7 8.4 17.9 6.1 15.6 5.3 17.9 4.5Z"
                                />
                            </svg>
                            <span className={styles.collapsibleLabel}>PEAgent</span>
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.menuBarItem, styles.hoverable, styles.todoMenuButton)}
                            onClick={this.handleToggleTodo}
                            title="项目 TODO"
                        >
                            <svg className={styles.todoMenuIcon} viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9 6h11M9 12h11M9 18h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                <path d="m3 6 1.4 1.4L7 4.8M3 12l1.4 1.4L7 10.8M3 18l1.4 1.4L7 16.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className={styles.collapsibleLabel}>TODO</span>
                        </button>

                        <MenuLabel
                            open={this.props.editMenuOpen}
                            onOpen={this.props.onClickEdit}
                            onClose={this.props.onRequestCloseEdit}
                        >
                            <img
                                src={editIcon}
                                draggable={false}
                                width={20}
                                height={20}
                            />
                            <span className={styles.collapsibleLabel}>
                                <FormattedMessage
                                    defaultMessage="Edit"
                                    description="Text for edit dropdown menu"
                                    id="gui.menuBar.edit"
                                />
                            </span>
                            <img
                                src={dropdownCaret}
                                draggable={false}
                                width={8}
                                height={5}
                            />
                            <MenuBarMenu
                                className={classNames(styles.menuBarMenu)}
                                open={this.props.editMenuOpen}
                                place={this.props.isRtl ? 'left' : 'right'}
                            >
                                {this.props.isPlayerOnly ? null : (
                                    <DeletionRestorer>{(handleRestore, {restorable, deletedItem}) => (
                                        <MenuItem
                                            className={classNames({[styles.disabled]: !restorable})}
                                            onClick={this.handleRestoreOption(handleRestore)}
                                        >
                                            {this.restoreOptionMessage(deletedItem)}
                                        </MenuItem>
                                    )}</DeletionRestorer>
                                )}
                                <MenuSection>
                                    <TurboMode>{(toggleTurboMode, {turboMode}) => (
                                        <MenuItem onClick={toggleTurboMode}>
                                            {turboMode ? (
                                                <FormattedMessage
                                                    defaultMessage="Turn off Turbo Mode"
                                                    description="Menu bar item for turning off turbo mode"
                                                    id="gui.menuBar.turboModeOff"
                                                />
                                            ) : (
                                                <FormattedMessage
                                                    defaultMessage="Turn on Turbo Mode"
                                                    description="Menu bar item for turning on turbo mode"
                                                    id="gui.menuBar.turboModeOn"
                                                />
                                            )}
                                        </MenuItem>
                                    )}</TurboMode>
                                    <FramerateChanger>{(changeFramerate, {framerate}) => (
                                        <MenuItem onClick={changeFramerate}>
                                            {framerate === 60 ? (
                                                <FormattedMessage
                                                    defaultMessage="Turn off 60 FPS Mode"
                                                    description="Menu bar item for turning off 60 FPS mode"
                                                    id="tw.menuBar.60off"
                                                />
                                            ) : (
                                                <FormattedMessage
                                                    defaultMessage="Turn on 60 FPS Mode"
                                                    description="Menu bar item for turning on 60 FPS mode"
                                                    id="tw.menuBar.60on"
                                                />
                                            )}
                                        </MenuItem>
                                    )}</FramerateChanger>
                                    <ChangeUsername>{changeUsername => (
                                        <MenuItem onClick={changeUsername}>
                                            <FormattedMessage
                                                defaultMessage="Change Username"
                                                description="Menu bar item for changing the username"
                                                id="tw.menuBar.changeUsername"
                                            />
                                        </MenuItem>
                                    )}</ChangeUsername>
                                    <CloudVariablesToggler>{(toggleCloudVariables, {enabled, canUseCloudVariables}) => (
                                        <MenuItem
                                            className={classNames({[styles.disabled]: !canUseCloudVariables})}
                                            onClick={toggleCloudVariables}
                                        >
                                            {canUseCloudVariables ? (
                                                enabled ? (
                                                    <FormattedMessage
                                                        defaultMessage="Disable Cloud Variables"
                                                        description="Menu bar item for disabling cloud variables"
                                                        id="tw.menuBar.cloudOff"
                                                    />
                                                ) : (
                                                    <FormattedMessage
                                                        defaultMessage="Enable Cloud Variables"
                                                        description="Menu bar item for enabling cloud variables"
                                                        id="tw.menuBar.cloudOn"
                                                    />
                                                )
                                            ) : (
                                                <FormattedMessage
                                                    defaultMessage="Cloud Variables are not Available"
                                                    // eslint-disable-next-line max-len
                                                    description="Menu bar item for when cloud variables are not available"
                                                    id="tw.menuBar.cloudUnavailable"
                                                />
                                            )}
                                        </MenuItem>
                                    )}</CloudVariablesToggler>
                                </MenuSection>
                                <MenuSection>
                                    <MenuItem onClick={this.props.onClickSettingsModal}>
                                        <FormattedMessage
                                            defaultMessage="Advanced Settings"
                                            description="Menu bar item for advanced settings"
                                            id="tw.menuBar.moreSettings"
                                        />
                                    </MenuItem>
                                </MenuSection>
                            </MenuBarMenu>
                        </MenuLabel>
                        {this.props.isTotallyNormal && (
                            <MenuLabel
                                open={this.props.modeMenuOpen}
                                onOpen={this.props.onClickMode}
                                onClose={this.props.onRequestCloseMode}
                            >
                                <FormattedMessage
                                    defaultMessage="Mode"
                                    description="Mode menu item in the menu bar"
                                    id="gui.menuBar.modeMenu"
                                />
                                <MenuBarMenu
                                    className={classNames(styles.menuBarMenu)}
                                    open={this.props.modeMenuOpen}
                                    place={this.props.isRtl ? 'left' : 'right'}
                                >
                                    <MenuSection>
                                        <MenuItem onClick={this.handleSetMode('NOW')}>
                                            <span className={classNames({[styles.inactive]: !this.props.modeNow})}>
                                                {'✓'}
                                            </span>
                                            {' '}
                                            <FormattedMessage
                                                defaultMessage="Normal mode"
                                                description="April fools: resets editor to not have any pranks"
                                                id="gui.menuBar.normalMode"
                                            />
                                        </MenuItem>
                                        <MenuItem onClick={this.handleSetMode('2020')}>
                                            <span className={classNames({[styles.inactive]: !this.props.mode2020})}>
                                                {'✓'}
                                            </span>
                                            {' '}
                                            <FormattedMessage
                                                defaultMessage="Caturday mode"
                                                description="April fools: Cat blocks mode"
                                                id="gui.menuBar.caturdayMode"
                                            />
                                        </MenuItem>
                                    </MenuSection>
                                </MenuBarMenu>
                            </MenuLabel>
                        )}

                        {this.props.onClickAddonSettings && (
                            <div
                                className={classNames(styles.menuBarItem, styles.hoverable)}
                                onClick={this.props.onClickAddonSettings}
                            >
                                <img
                                    src={addonsIcon}
                                    draggable={false}
                                    width={20}
                                    height={20}
                                />
                                <span className={styles.collapsibleLabel}>
                                    <FormattedMessage
                                        defaultMessage="Addons"
                                        description="Button to open addon settings"
                                        id="tw.menuBar.addons"
                                    />
                                </span>
                            </div>
                        )}
                        {this.props.onClickSettingsModal && (
                            <div
                                className={classNames(styles.menuBarItem, styles.hoverable)}
                                onClick={this.props.onClickSettingsModal}
                            >
                                <span className={styles.collapsibleLabel}>
                                    <FormattedMessage
                                        defaultMessage="Advanced"
                                        description="Button to open advanced settings menu"
                                        id="tw.menuBar.advanced"
                                    />
                                </span>
                            </div>
                        )}
                    </div>

                    <Divider className={styles.divider} />

                    {this.props.canEditTitle ? (
                        <div className={classNames(styles.menuBarItem, styles.growable)} />
                    ) : ((this.props.authorUsername && this.props.authorUsername !== this.props.username) ? (
                        <AuthorInfo
                            className={styles.authorInfo}
                            imageUrl={this.props.authorThumbnailUrl}
                            projectId={this.props.projectId}
                            projectTitle={this.props.projectTitle}
                            userId={this.props.authorId}
                            username={this.props.authorUsername}
                        />
                    ) : null)}
                    {this.props.canShare ? (
                        (this.props.isShowingProject || this.props.isUpdating) && (
                            <div className={classNames(styles.menuBarItem)}>
                                <ProjectWatcher onDoneUpdating={this.props.onSeeCommunity}>
                                    {
                                        waitForUpdate => (
                                            <ShareButton
                                                className={styles.menuBarButton}
                                                isShared={this.props.isShared}
                                                /* eslint-disable react/jsx-no-bind */
                                                onClick={() => {
                                                    this.handleClickShare(waitForUpdate);
                                                }}
                                                /* eslint-enable react/jsx-no-bind */
                                            />
                                        )
                                    }
                                </ProjectWatcher>
                            </div>
                        )
                    ) : this.props.showComingSoon ? (
                        <div className={classNames(styles.menuBarItem)}>
                            <MenuBarItemTooltip id="share-button">
                                <ShareButton className={styles.menuBarButton} />
                            </MenuBarItemTooltip>
                        </div>
                    ) : null}
                    {this.props.canRemix && (
                        <div className={classNames(styles.menuBarItem)}>
                            {remixButton}
                        </div>
                    )}
                    <div className={classNames(styles.menuBarItem, styles.communityButtonWrapper)}>
                        {this.props.enableCommunity ? (
                            (this.props.isShowingProject || this.props.isUpdating) && (
                                <ProjectWatcher onDoneUpdating={this.props.onSeeCommunity}>
                                    {
                                        waitForUpdate => (
                                            <CommunityButton
                                                className={styles.menuBarButton}
                                                /* eslint-disable react/jsx-no-bind */
                                                onClick={() => {
                                                    this.handleClickSeeCommunity(waitForUpdate);
                                                }}
                                                /* eslint-enable react/jsx-no-bind */
                                            />
                                        )
                                    }
                                </ProjectWatcher>
                            )
                        ) : (this.props.showComingSoon ? (
                            <MenuBarItemTooltip id="community-button">
                                <CommunityButton className={styles.menuBarButton} />
                            </MenuBarItemTooltip>
                        ) : (this.props.enableSeeInside ? (
                            <SeeInsideButton
                                className={styles.menuBarButton}
                                onClick={this.handleClickSeeInside}
                            />
                        ) : []))}
                    </div>
                </div>

                <div className={styles.accountInfoGroup}>
                    <button
                        type="button"
                        className={styles.pointerEAccountButton}
                        onClick={this.handleOpenAccount}
                        title="PointerE 个人中心"
                    >
                        <span className={styles.pointerEAccountAvatar}>
                            {this.state.accountUser ?
                                String(this.state.accountUser.nickname || this.state.accountUser.username || 'P')
                                    .slice(0, 1).toUpperCase() : 'P'}
                        </span>
                        <span className={styles.pointerEAccountLabel}>
                            {this.state.accountUser ?
                                (this.state.accountUser.nickname || this.state.accountUser.username) :
                                '登录 PointerE'}
                        </span>
                        {this.state.accountUser && this.state.accountPoints !== null ? (
                            <span className={styles.pointerEAccountPoints}>
                                {this.state.accountPoints} 分
                            </span>
                        ) : null}
                    </button>
                    <TWSaveStatus
                        showSaveFilePicker={this.props.showSaveFilePicker}
                    />
                </div>

                {aboutButton}
            </Box>
        );

        return (
            <React.Fragment>
                {menuBar}
                <TWNews />
                {this.state.publishOpen && (
                    <PointerPublishModal
                        vm={this.props.vm}
                        projectTitle={this.props.projectTitle}
                        onClose={this.handleClosePublish}
                    />
                )}
                {(this.state.collabOpen || this.state.collabActive) && (
                    <PointerCollabModal
                        vm={this.props.vm}
                        hidden={!this.state.collabOpen}
                        onCollabState={this.handleCollabState}
                        onClose={this.handleCloseCollab}
                    />
                )}
                {this.state.accountOpen && (
                    <PointerAccountCenter
                        onClose={this.handleCloseAccount}
                    />
                )}
                {this.state.peagentOpen && (
                    <PointerPeAgent
                        vm={this.props.vm}
                        onClose={this.handleClosePeAgent}
                    />
                )}
                {this.state.assetToast ? (
                    <div className={styles.assetToast}>{this.state.assetToast}</div>
                ) : null}
                {this.state.todoOpen && (
                    <PointerTodoBoard onClose={this.handleToggleTodo} />
                )}
                {this.state.aboutOpen && (
                    <PointerAboutModal onClose={this.handleCloseAbout} />
                )}
                <PointerCloudNotices />

                {this.state.pointsToast ? (
                    <div className={styles.pointsToast}>{this.state.pointsToast}</div>
                ) : null}
                {this.state.collabActive && !this.state.collabOpen && (
                    <button
                        type="button"
                        className={styles.collabIndicator}
                        onClick={this.handleOpenCollab}
                        title="打开在线协作"
                    >
                        <span className={styles.collabIndicatorDot} />
                        <span className={styles.collabIndicatorText}>
                            协作中 · {this.state.collabRoom || '—'} · {this.state.collabPeers} 人
                        </span>
                        {this.state.collabNotice ? (
                            <span className={styles.collabIndicatorNotice}>{this.state.collabNotice}</span>
                        ) : null}
                    </button>
                )}
            </React.Fragment>
        );
    }
}

MenuBar.propTypes = {
    enableSeeInside: PropTypes.bool,
    onClickSeeInside: PropTypes.func,
    aboutMenuOpen: PropTypes.bool,
    accountMenuOpen: PropTypes.bool,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    autoUpdateProject: PropTypes.func,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    className: PropTypes.string,
    errors: PropTypes.arrayOf(PropTypes.shape({
        sprite: PropTypes.string,
        error: PropTypes.string,
        id: PropTypes.number
    })),
    errorsMenuOpen: PropTypes.bool,
    onClickErrors: PropTypes.func,
    onRequestCloseErrors: PropTypes.func,
    confirmReadyToReplaceProject: PropTypes.func,
    currentLocale: PropTypes.string.isRequired,
    editMenuOpen: PropTypes.bool,
    enableCommunity: PropTypes.bool,
    fileMenuOpen: PropTypes.bool,
    handleSaveProject: PropTypes.func,
    intl: intlShape,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isShowingProject: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    isUpdating: PropTypes.bool,
    locale: PropTypes.string.isRequired,
    loginMenuOpen: PropTypes.bool,
    mode1920: PropTypes.bool,
    mode1990: PropTypes.bool,
    mode2020: PropTypes.bool,
    mode220022BC: PropTypes.bool,
    modeMenuOpen: PropTypes.bool,
    modeNow: PropTypes.bool,
    onClickAbout: PropTypes.oneOfType([
        PropTypes.func, // button mode: call this callback when the About button is clicked
        PropTypes.arrayOf( // menu mode: list of items in the About menu
            PropTypes.shape({
                title: PropTypes.string, // text for the menu item
                onClick: PropTypes.func // call this callback when the menu item is clicked
            })
        )
    ]),
    onClickAccount: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickPackager: PropTypes.func,
    onClickRestorePoints: PropTypes.func,
    onClickEdit: PropTypes.func,
    onClickFile: PropTypes.func,
    onClickLogin: PropTypes.func,
    onClickMode: PropTypes.func,
    onClickNew: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickRemix: PropTypes.func,
    onClickSave: PropTypes.func,
    onClickSaveAsCopy: PropTypes.func,
    onClickSettings: PropTypes.func,
    onClickSettingsModal: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onOpenTipLibrary: PropTypes.func,
    onProjectTelemetryEvent: PropTypes.func,
    onProjectUnchanged: PropTypes.func,
    onRequestCloseAbout: PropTypes.func,
    onRequestCloseAccount: PropTypes.func,
    onRequestCloseEdit: PropTypes.func,
    onRequestCloseFile: PropTypes.func,
    onRequestCloseLogin: PropTypes.func,
    onRequestCloseMode: PropTypes.func,
    onRequestCloseSettings: PropTypes.func,
    onRequestOpenAbout: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onSetFileHandle: PropTypes.func,
    onSetProjectTitle: PropTypes.func,
    onSetTimeTravelMode: PropTypes.func,
    onShare: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    projectId: PropTypes.string,
    projectTitle: PropTypes.string,
    renderLogin: PropTypes.func,
    sessionExists: PropTypes.bool,
    settingsMenuOpen: PropTypes.bool,
    shouldSaveBeforeTransition: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    showComingSoon: PropTypes.bool,
    username: PropTypes.string,
    userOwnsProject: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

MenuBar.defaultProps = {
    onShare: () => {}
};

const mapStateToProps = (state, ownProps) => {
    const loadingState = state.scratchGui.projectState.loadingState;
    const user = state.session && state.session.session && state.session.session.user;
    return {
        authorUsername: state.scratchGui.tw.author.username,
        authorThumbnailUrl: state.scratchGui.tw.author.thumbnail,
        projectId: state.scratchGui.projectState.projectId,
        aboutMenuOpen: aboutMenuOpen(state),
        accountMenuOpen: accountMenuOpen(state),
        currentLocale: state.locales.locale,
        fileMenuOpen: fileMenuOpen(state),
        editMenuOpen: editMenuOpen(state),
        errors: state.scratchGui.tw.compileErrors,
        errorsMenuOpen: errorsMenuOpen(state),
        isPlayerOnly: state.scratchGui.mode.isPlayerOnly,
        isRtl: state.locales.isRtl,
        isUpdating: getIsUpdating(loadingState),
        isShowingProject: getIsShowingProject(loadingState),
        locale: state.locales.locale,
        loginMenuOpen: loginMenuOpen(state),
        modeMenuOpen: modeMenuOpen(state),
        projectTitle: state.scratchGui.projectTitle,
        sessionExists: state.session && typeof state.session.session !== 'undefined',
        settingsMenuOpen: settingsMenuOpen(state),
        username: user ? user.username : null,
        userOwnsProject: ownProps.authorUsername && user &&
            (ownProps.authorUsername === user.username),
        vm: state.scratchGui.vm,
        mode220022BC: isTimeTravel220022BC(state),
        mode1920: isTimeTravel1920(state),
        mode1990: isTimeTravel1990(state),
        mode2020: isTimeTravel2020(state),
        modeNow: isTimeTravelNow(state)
    };
};

const mapDispatchToProps = dispatch => ({
    onClickSeeInside: () => dispatch(setPlayer(false)),
    autoUpdateProject: () => dispatch(autoUpdateProject()),
    onOpenTipLibrary: () => dispatch(openTipsLibrary()),
    onClickAccount: () => dispatch(openAccountMenu()),
    onRequestCloseAccount: () => dispatch(closeAccountMenu()),
    onClickFile: () => dispatch(openFileMenu()),
    onRequestCloseFile: () => dispatch(closeFileMenu()),
    onClickEdit: () => dispatch(openEditMenu()),
    onRequestCloseEdit: () => dispatch(closeEditMenu()),
    onClickErrors: () => dispatch(openErrorsMenu()),
    onRequestCloseErrors: () => dispatch(closeErrorsMenu()),
    onClickLogin: () => dispatch(openLoginMenu()),
    onRequestCloseLogin: () => dispatch(closeLoginMenu()),
    onClickMode: () => dispatch(openModeMenu()),
    onRequestCloseMode: () => dispatch(closeModeMenu()),
    onRequestOpenAbout: () => dispatch(openAboutMenu()),
    onRequestCloseAbout: () => dispatch(closeAboutMenu()),
    onClickRestorePoints: () => dispatch(openRestorePointModal()),
    onClickSettings: () => dispatch(openSettingsMenu()),
    onClickSettingsModal: () => {
        dispatch(closeEditMenu());
        dispatch(openSettingsModal());
    },
    onRequestCloseSettings: () => dispatch(closeSettingsMenu()),
    onClickNew: needSave => {
        dispatch(requestNewProject(needSave));
        dispatch(setFileHandle(null));
    },
    onClickRemix: () => dispatch(remixProject()),
    onClickSave: () => dispatch(manualUpdateProject()),
    onClickSaveAsCopy: () => dispatch(saveProjectAsCopy()),
    onSeeCommunity: () => dispatch(setPlayer(true)),
    onSetFileHandle: handle => dispatch(setFileHandle(handle)),
    onSetProjectTitle: title => dispatch(setProjectTitle(title)),
    onProjectUnchanged: () => dispatch(setProjectUnchanged()),
    onSetTimeTravelMode: mode => dispatch(setTimeTravel(mode))
});

export default compose(
    injectIntl,
    MenuBarHOC,
    connect(
        mapStateToProps,
        mapDispatchToProps
    )
)(MenuBar);
