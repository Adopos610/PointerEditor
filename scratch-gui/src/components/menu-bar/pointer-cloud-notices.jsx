import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

import {APP_VERSION} from '../../lib/brand';
import styles from './pointer-cloud-notices.css';

const NOTICES_API = 'https://vable.ctspace.xyz/api/notices';
const SEEN_KEY = 'pointere.seenNotices.v1';
const UPDATE_DISMISS_KEY = 'pointere.updateDismissed.v1';

const readSeen = () => {
    try {
        const value = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
        return new Set(Array.isArray(value) ? value : []);
    } catch (error) {
        return new Set();
    }
};

const writeSeen = seen => {
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-100)));
    } catch (error) {
        // Ignore storage failures.
    }
};

const versionParts = value => String(value || '')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0);

const isNewer = (latest, current) => {
    const a = versionParts(latest);
    const b = versionParts(current);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        if ((a[index] || 0) > (b[index] || 0)) return true;
        if ((a[index] || 0) < (b[index] || 0)) return false;
    }
    return false;
};

class PointerCloudNotices extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            queue: [],
            update: null,
            updateDismissed: false
        };
        this.seen = readSeen();
        this.pollTimer = null;
    }

    componentDidMount () {
        this.mounted = true;
        this.fetchNotices();
        this.pollTimer = setInterval(() => this.fetchNotices(), 3 * 60 * 1000);
    }

    componentWillUnmount () {
        this.mounted = false;
        clearInterval(this.pollTimer);
    }

    fetchNotices () {
        fetch(NOTICES_API, {cache: 'no-store'})
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (!this.mounted) return;
                const announcements = Array.isArray(data.announcements) ? data.announcements : [];
                const unseen = announcements.filter(notice => notice && notice.id && !this.seen.has(notice.id));
                const release = data.release || null;
                let dismissedVersion = '';
                try {
                    dismissedVersion = localStorage.getItem(UPDATE_DISMISS_KEY) || '';
                } catch (error) {
                    dismissedVersion = '';
                }
                const updateAvailable = release && release.version &&
                    isNewer(release.version, APP_VERSION) &&
                    dismissedVersion !== release.version;
                this.setState(previous => ({
                    queue: unseen.length ? unseen : previous.queue,
                    update: updateAvailable ? release : null,
                    updateDismissed: false
                }));
            })
            .catch(() => {
                // Announcements are best-effort; never block the editor.
            });
    }

    dismissNotice () {
        const current = this.state.queue[0];
        if (current) {
            this.seen.add(current.id);
            writeSeen(this.seen);
        }
        this.setState(previous => ({queue: previous.queue.slice(1)}));
    }

    dismissUpdate () {
        const version = this.state.update && this.state.update.version;
        if (version) {
            try {
                localStorage.setItem(UPDATE_DISMISS_KEY, version);
            } catch (error) {
                // Ignore storage failures.
            }
        }
        this.setState({update: null, updateDismissed: true});
    }

    openUpdate () {
        const update = this.state.update;
        if (!update) return;
        const target = update.downloadUrl || update.notesUrl;
        if (target) window.open(target, '_blank', 'noopener');
        this.dismissUpdate();
    }

    renderNotice () {
        const notice = this.state.queue[0];
        if (!notice) return null;
        const level = notice.level === 'warning' ? styles.noticeWarning :
            (notice.level === 'update' ? styles.noticeUpdate : styles.noticeInfo);
        const levelLabel = notice.level === 'warning' ? '重要提醒' :
            (notice.level === 'update' ? '版本更新' : '云公告');
        return ReactDOM.createPortal(
            <div className={styles.overlay} role="dialog" aria-modal="true">
                <div className={styles.panel}>
                    <div className={`${styles.noticeHead} ${level}`}>
                        <span className={styles.noticeLabel}>{levelLabel}</span>
                        <button
                            type="button"
                            className={styles.close}
                            onClick={() => this.dismissNotice()}
                            aria-label="关闭公告"
                        >
                            ×
                        </button>
                    </div>
                    <h2>{notice.title}</h2>
                    <div className={styles.noticeBody}>{notice.body}</div>
                    <div className={styles.noticeFooter}>
                        {this.state.queue.length > 1 ? (
                            <span className={styles.more}>还有 {this.state.queue.length - 1} 条公告</span>
                        ) : <span />}
                        <button type="button" className={styles.primary} onClick={() => this.dismissNotice()}>
                            知道了
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    renderUpdateBanner () {
        const update = this.state.update;
        if (!update) return null;
        return ReactDOM.createPortal(
            <div className={styles.updateBanner}>
                <div className={styles.updateText}>
                    <strong>发现新版本 {update.version}</strong>
                    <span>当前版本 {APP_VERSION}，更新推送来自指针迭代实验室</span>
                </div>
                <div className={styles.updateActions}>
                    <button type="button" className={styles.primarySmall} onClick={() => this.openUpdate()}>
                        查看更新
                    </button>
                    <button type="button" className={styles.ghost} onClick={() => this.dismissUpdate()}>
                        稍后
                    </button>
                    <button
                        type="button"
                        className={styles.bannerClose}
                        onClick={() => this.dismissUpdate()}
                        aria-label="关闭更新提示"
                    >
                        ×
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    render () {
        return (
            <React.Fragment>
                {this.renderNotice()}
                {this.renderUpdateBanner()}
            </React.Fragment>
        );
    }
}

PointerCloudNotices.propTypes = {};

export default PointerCloudNotices;
