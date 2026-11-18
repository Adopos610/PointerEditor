import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

import {APP_NAME, APP_VERSION} from '../../lib/brand';
import styles from './pointer-about-modal.css';

const RELEASE_API = 'https://vable.ctspace.xyz/api/notices';

const versionParts = value => String(value || '')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0);

const versionSuffix = value => {
    const text = String(value || '').replace(/^v/i, '');
    const index = text.indexOf('-');
    return index >= 0 ? text.slice(index + 1) : '';
};

const isNewer = (latest, current) => {
    const a = versionParts(latest);
    const b = versionParts(current);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        if ((a[index] || 0) > (b[index] || 0)) return true;
        if ((a[index] || 0) < (b[index] || 0)) return false;
    }
    const latestSuffix = versionSuffix(latest);
    const currentSuffix = versionSuffix(current);
    if (latestSuffix && !currentSuffix) return true;
    if (latestSuffix && currentSuffix && latestSuffix !== currentSuffix) return true;
    return false;
};

const openLink = url => {
    if (url) window.open(url, '_blank', 'noopener');
};

class PointerAboutModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status: 'checking',
            release: null,
            error: ''
        };
        this.checkUpdates = this.checkUpdates.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        this.checkUpdates();
    }

    componentWillUnmount () {
        this.mounted = false;
    }

    checkUpdates () {
        this.setState({status: 'checking', error: ''});
        fetch(RELEASE_API, {cache: 'no-store'})
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (!this.mounted) return;
                const release = data && data.release ? data.release : null;
                if (release && release.version && isNewer(release.version, APP_VERSION)) {
                    this.setState({status: 'available', release});
                } else {
                    this.setState({status: 'latest', release});
                }
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({status: 'error', error: error.message});
            });
    }

    renderStatus () {
        const {status, release, error} = this.state;
        if (status === 'checking') return <span className={styles.checking}>正在检查更新…</span>;
        if (status === 'available') {
            return (
                <span className={styles.available}>
                    发现新版本 {release.version}
                </span>
            );
        }
        if (status === 'latest') return <span className={styles.latest}>已是最新版本</span>;
        if (status === 'error') return <span className={styles.error}>检查失败：{error}</span>;
        return null;
    }

    render () {
        const {status, release} = this.state;
        return ReactDOM.createPortal(
            <div className={styles.overlay} role="dialog" aria-modal="true">
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <div className={styles.brandBadge}>P</div>
                        <div className={styles.titleBlock}>
                            <strong>{APP_NAME}</strong>
                            <span>版本 {APP_VERSION}</span>
                        </div>
                        <button type="button" className={styles.close} onClick={this.props.onClose} aria-label="关闭">
                            ×
                        </button>
                    </div>
                    <div className={styles.body}>
                        <p className={styles.intro}>
                            蓝白主题的 Scratch 兼容编辑器，支持 PEAgent、在线协作、云端版本记录与扩展库。
                            由指针迭代实验室维护，整体以 GPL-3.0 分发。
                        </p>
                        <div className={styles.updateRow}>
                            <div className={styles.updateStatus}>
                                <span className={styles.updateLabel}>更新状态</span>
                                {this.renderStatus()}
                            </div>
                            <button
                                type="button"
                                className={styles.checkButton}
                                onClick={this.checkUpdates}
                                disabled={status === 'checking'}
                            >
                                检查更新
                            </button>
                        </div>
                        {status === 'available' ? (
                            <div className={styles.updateActions}>
                                <button
                                    type="button"
                                    className={styles.primary}
                                    onClick={() => openLink(release.downloadUrl)}
                                >
                                    下载 {release.version}
                                </button>
                                <button
                                    type="button"
                                    className={styles.secondary}
                                    onClick={() => openLink(release.notesUrl)}
                                >
                                    查看更新说明
                                </button>
                            </div>
                        ) : null}
                        <div className={styles.links}>
                            <button type="button" className={styles.linkCard} onClick={() => openLink('https://peditor.ctspace.xyz/')}>
                                <strong>官网</strong>
                                <span>peditor.ctspace.xyz</span>
                            </button>
                            <button
                                type="button"
                                className={styles.linkCard}
                                onClick={() => openLink('https://github.com/PointerItera/PointerEditor')}
                            >
                                <strong>GitHub</strong>
                                <span>PointerItera/PointerEditor</span>
                            </button>
                            <button
                                type="button"
                                className={styles.linkCard}
                                onClick={() => openLink('https://peditor.ctspace.xyz/docs/')}
                            >
                                <strong>文档</strong>
                                <span>使用与开发文档</span>
                            </button>
                            <button
                                type="button"
                                className={styles.linkCard}
                                onClick={() => openLink('https://github.com/PointerItera/PointerEditor/issues')}
                            >
                                <strong>反馈</strong>
                                <span>报告问题与建议</span>
                            </button>
                        </div>
                        <p className={styles.footerNote}>
                            © 2026 指针迭代实验室 · PointerEditor 与 MIT、Scratch 团队无隶属关系
                        </p>
                    </div>
                </div>
            </div>,
            document.body
        );
    }
}

PointerAboutModal.propTypes = {
    onClose: PropTypes.func.isRequired
};

export default PointerAboutModal;
