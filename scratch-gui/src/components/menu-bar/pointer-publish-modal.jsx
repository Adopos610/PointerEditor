import PropTypes from 'prop-types';
import React from 'react';

import {
    clearSession,
    fetchCaptcha,
    fetchMe,
    fetchProjectDetail,
    getSession,
    login,
    loginWithApiKey,
    publishProject
} from '../../lib/pointer-community';
import styles from './pointer-publish-modal.css';

const COMMUNITY_SITE = 'https://forum.ctspace.xyz';

const CATEGORIES = [
    {value: 'game', label: '游戏'},
    {value: 'animation', label: '动画'},
    {value: 'story', label: '故事'},
    {value: 'music', label: '音乐'},
    {value: 'art', label: '美术'},
    {value: 'tutorial', label: '教程'}
];

const dataUrlToBlob = dataUrl => {
    const parts = dataUrl.split(',');
    const mimeMatch = /data:([^;]+)/.exec(parts[0]);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], {type: mime});
};

const captureStage = vm => new Promise(resolve => {
    if (!vm || !vm.renderer || typeof vm.renderer.requestSnapshot !== 'function') {
        resolve(null);
        return;
    }
    let settled = false;
    const finish = dataUrl => {
        if (settled) return;
        settled = true;
        resolve(dataUrl || null);
    };
    setTimeout(() => finish(null), 3000);
    try {
        vm.renderer.requestSnapshot(dataUrl => finish(dataUrl));
    } catch (error) {
        finish(null);
    }
});

const displayName = user => (
    (user && (user.nickname || user.username)) || '创客次元用户'
);

class PointerPublishModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            checking: Boolean(getSession()),
            session: getSession(),
            authMode: 'account',
            username: '',
            password: '',
            apiKey: '',
            captcha: null,
            captchaLoading: false,
            captchaAnswer: '',
            title: props.projectTitle || '未命名作品',
            summary: '',
            category: 'game',
            allowDownload: true,
            coverPreview: null,
            coverBlob: null,
            busy: false,
            status: '',
            error: '',
            result: null
        };
        this.handleClose = this.handleClose.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleRefreshCaptcha = this.handleRefreshCaptcha.bind(this);
        this.handleLogin = this.handleLogin.bind(this);
        this.handleApiKeyLogin = this.handleApiKeyLogin.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
        this.handlePublish = this.handlePublish.bind(this);
        this.handleRefreshCover = this.handleRefreshCover.bind(this);
        this.handleCopyLink = this.handleCopyLink.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        const {session} = this.state;
        if (!session) {
            this.loadCaptcha();
            return;
        }
        fetchMe(session.token)
            .then(user => {
                if (!this.mounted) return;
                this.setState({
                    checking: false,
                    session: {...session, user}
                }, () => this.refreshCover());
            })
            .catch(() => {
                if (!this.mounted) return;
                clearSession();
                this.setState({checking: false, session: null}, () => {
                    this.loadCaptcha();
                });
            });
    }

    componentWillUnmount () {
        this.mounted = false;
    }

    handleChange (event) {
        const {name, value, type, checked} = event.target;
        this.setState({[name]: type === 'checkbox' ? checked : value});
    }

    handleClose () {
        this.props.onClose();
    }

    loadCaptcha (preserveError) {
        this.setState(current => ({
            captchaLoading: true,
            captchaAnswer: '',
            error: preserveError ? current.error : ''
        }));
        fetchCaptcha()
            .then(captcha => {
                if (!this.mounted) return;
                this.setState({captcha, captchaLoading: false});
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({captchaLoading: false, error: error.message});
            });
    }

    handleRefreshCaptcha (event) {
        if (event) event.preventDefault();
        this.loadCaptcha(false);
    }

    refreshCover () {
        captureStage(this.props.vm).then(dataUrl => {
            if (!this.mounted) return;
            if (!dataUrl) {
                this.setState({coverPreview: null, coverBlob: null});
                return;
            }
            this.setState({
                coverPreview: dataUrl,
                coverBlob: dataUrlToBlob(dataUrl)
            });
        });
    }

    handleRefreshCover (event) {
        if (event) event.preventDefault();
        this.refreshCover();
    }

    handleLogin (event) {
        event.preventDefault();
        const {username, password, captchaAnswer, captcha} = this.state;
        if (!username.trim() || !password) {
            this.setState({error: '请输入用户名和密码'});
            return;
        }
        if (!captcha) {
            this.setState({error: '验证码加载失败，请点击图片重试'});
            return;
        }
        if (captchaAnswer.trim().length !== 6) {
            this.setState({error: '请输入图里的 6 位验证码'});
            return;
        }
        this.setState({busy: true, error: '', status: '正在验证…'});
        login({
            username: username.trim(),
            password,
            captchaAnswer: captchaAnswer.trim(),
            captcha
        })
            .then(session => {
                if (!this.mounted) return;
                this.setState({
                    busy: false,
                    status: '',
                    session,
                    username: '',
                    password: '',
                    captchaAnswer: ''
                }, () => this.refreshCover());
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({busy: false, status: '', error: error.message});
                this.loadCaptcha();
            });
    }

    handleApiKeyLogin (event) {
        event.preventDefault();
        const {apiKey} = this.state;
        if (!apiKey.trim()) {
            this.setState({error: '请填写 API Key'});
            return;
        }
        this.setState({busy: true, error: '', status: '正在校验密钥…'});
        loginWithApiKey(apiKey)
            .then(session => {
                if (!this.mounted) return;
                this.setState({
                    busy: false,
                    status: '',
                    session,
                    apiKey: ''
                }, () => this.refreshCover());
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({busy: false, status: '', error: error.message});
            });
    }

    handleLogout () {
        clearSession();
        this.setState({
            session: null,
            captcha: null,
            result: null,
            coverPreview: null,
            coverBlob: null,
            error: '',
            status: ''
        }, () => this.loadCaptcha());
    }

    handlePublish (event) {
        event.preventDefault();
        const {session, title, summary, category, allowDownload} = this.state;
        if (!session) return;
        const trimmedTitle = title.trim();
        if (trimmedTitle.length < 2) {
            this.setState({error: '作品名至少需要 2 个字'});
            return;
        }
        this.setState({busy: true, error: '', status: '正在导出作品…'});
        Promise.resolve(this.props.vm.saveProjectSb3('blob'))
            .then(sb3 => {
                if (!this.mounted) return null;
                this.setState({status: '正在上传作品…'});
                return publishProject({
                    token: session.token,
                    title: trimmedTitle,
                    summary: summary.trim(),
                    category,
                    allowDownload,
                    sb3,
                    cover: this.state.coverBlob
                });
            })
            .then(project => {
                if (!this.mounted || !project) return null;
                this.setState({status: '正在获取作品链接…'});
                return fetchProjectDetail(project.id, session.token)
                    .then(detail => ({project, detail}))
                    .catch(() => ({project, detail: null}));
            })
            .then(payload => {
                if (!this.mounted || !payload) return;
                const {project, detail} = payload;
                const slug = project.shortLinkSlug || (detail && detail.shortLinkSlug);
                this.setState({
                    busy: false,
                    status: '',
                    result: {
                        title: project.title || trimmedTitle,
                        slug,
                        url: slug ? `${COMMUNITY_SITE}/g/${slug}` : '',
                        projectId: project.id
                    }
                });
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({busy: false, status: '', error: error.message});
                if (error.status === 401) {
                    clearSession();
                    this.setState({session: null});
                    this.loadCaptcha();
                }
            });
    }

    handleCopyLink () {
        const {result} = this.state;
        if (!result || !result.url) return;
        const done = () => this.setState({status: '链接已复制'});
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(result.url).then(done).catch(() => this.fallbackCopy(result.url, done));
        } else {
            this.fallbackCopy(result.url, done);
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
            this.setState({error: '复制失败，请手动选择链接'});
        }
        document.body.removeChild(input);
    }

    renderAuth () {
        const {authMode, username, password, apiKey, captcha, captchaLoading, captchaAnswer, busy} = this.state;
        return (
            <form className={styles.form}>
                <div className={styles.tabs}>
                    <button
                        type="button"
                        className={authMode === 'account' ? styles.tabActive : styles.tab}
                        onClick={() => this.setState({authMode: 'account', error: ''})}
                    >
                        账号登录
                    </button>
                    <button
                        type="button"
                        className={authMode === 'key' ? styles.tabActive : styles.tab}
                        onClick={() => this.setState({authMode: 'key', error: ''})}
                    >
                        API Key
                    </button>
                </div>
                {authMode === 'account' ? (
                    <React.Fragment>
                        <label className={styles.field}>
                            <span>用户名 / 邮箱</span>
                            <input
                                name="username"
                                value={username}
                                onChange={this.handleChange}
                                autoComplete="username"
                                placeholder="创客次元账号"
                            />
                        </label>
                        <label className={styles.field}>
                            <span>密码</span>
                            <input
                                name="password"
                                type="password"
                                value={password}
                                onChange={this.handleChange}
                                autoComplete="current-password"
                                placeholder="登录密码"
                            />
                        </label>
                        <div className={styles.captchaRow}>
                            <label className={styles.field}>
                                <span>验证码（6 位）</span>
                                <input
                                    name="captchaAnswer"
                                    value={captchaAnswer}
                                    onChange={this.handleChange}
                                    maxLength={6}
                                    autoComplete="off"
                                    placeholder="输入图中字符"
                                />
                            </label>
                            <button
                                type="button"
                                className={styles.captchaImage}
                                onClick={this.handleRefreshCaptcha}
                                title="点击刷新验证码"
                            >
                                {captcha && captcha.image ? (
                                    <img src={captcha.image} alt="验证码" />
                                ) : (
                                    <span>{captchaLoading ? '加载中…' : '点击加载'}</span>
                                )}
                            </button>
                        </div>
                        <p className={styles.hint}>登录后即可发布作品；验证码不区分大小写。</p>
                        <button
                            type="button"
                            className={styles.primary}
                            disabled={busy}
                            onClick={this.handleLogin}
                        >
                            {busy ? '请稍候…' : '登录'}
                        </button>
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <label className={styles.field}>
                            <span>API Key</span>
                            <input
                                name="apiKey"
                                value={apiKey}
                                onChange={this.handleChange}
                                placeholder="fk_live_..."
                                autoComplete="off"
                            />
                        </label>
                        <p className={styles.hint}>
                            登录创客次元后，在「开发者平台」签发 API Key，密钥只在创建时显示一次。
                        </p>
                        <button
                            type="button"
                            className={styles.primary}
                            disabled={busy}
                            onClick={this.handleApiKeyLogin}
                        >
                            {busy ? '请稍候…' : '使用密钥登录'}
                        </button>
                    </React.Fragment>
                )}
            </form>
        );
    }

    renderPublish () {
        const {
            session, title, summary, category, allowDownload,
            coverPreview, busy, status
        } = this.state;
        return (
            <form className={styles.form}>
                <div className={styles.userRow}>
                    <span>已登录：<strong>{displayName(session.user)}</strong></span>
                    <button type="button" className={styles.linkButton} onClick={this.handleLogout}>
                        退出
                    </button>
                </div>
                <label className={styles.field}>
                    <span>作品名称</span>
                    <input
                        name="title"
                        value={title}
                        onChange={this.handleChange}
                        maxLength={255}
                        placeholder="给你的作品起个名字"
                    />
                </label>
                <label className={styles.field}>
                    <span>一句话简介</span>
                    <input
                        name="summary"
                        value={summary}
                        onChange={this.handleChange}
                        maxLength={500}
                        placeholder="选填，一句话介绍作品"
                    />
                </label>
                <div className={styles.row}>
                    <label className={styles.field}>
                        <span>分类</span>
                        <select name="category" value={category} onChange={this.handleChange}>
                            {CATEGORIES.map(item => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.checkbox}>
                        <input
                            name="allowDownload"
                            type="checkbox"
                            checked={allowDownload}
                            onChange={this.handleChange}
                        />
                        <span>允许下载源文件</span>
                    </label>
                </div>
                <div className={styles.coverRow}>
                    <div className={styles.coverPreview}>
                        {coverPreview ? (
                            <img src={coverPreview} alt="作品封面" />
                        ) : (
                            <span>暂无封面</span>
                        )}
                    </div>
                    <div className={styles.coverHint}>
                        <span>封面取自当前舞台</span>
                        <button type="button" className={styles.secondary} onClick={this.handleRefreshCover}>
                            重新截取
                        </button>
                    </div>
                </div>
                {status ? <p className={styles.status}>{status}</p> : null}
                <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={this.handlePublish}
                >
                    {busy ? '正在发布…' : '发布作品'}
                </button>
            </form>
        );
    }

    renderResult () {
        const {result} = this.state;
        return (
            <div className={styles.form}>
                <div className={styles.successBadge}>发布成功</div>
                <p className={styles.successText}>《{result.title}》已经出现在创客次元作品广场。</p>
                {result.url ? (
                    <label className={styles.field}>
                        <span>作品网址</span>
                        <input readOnly value={result.url} onFocus={event => event.target.select()} />
                    </label>
                ) : (
                    <p className={styles.hint}>作品 ID：{result.projectId}</p>
                )}
                <div className={styles.resultActions}>
                    {result.url ? (
                        <button type="button" className={styles.primary} onClick={this.handleCopyLink}>
                            复制链接
                        </button>
                    ) : null}
                    {result.url ? (
                        <a
                            className={styles.secondary}
                            href={result.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            打开作品页
                        </a>
                    ) : null}
                    <button type="button" className={styles.secondary} onClick={this.handleClose}>
                        完成
                    </button>
                </div>
            </div>
        );
    }

    render () {
        const {checking, session, error, status, result} = this.state;
        let body;
        if (checking) {
            body = <div className={styles.loading}>正在连接创客次元…</div>;
        } else if (result) {
            body = this.renderResult();
        } else if (session) {
            body = this.renderPublish();
        } else {
            body = this.renderAuth();
        }
        return (
            <div className={styles.overlay} role="dialog" aria-modal="true">
                <div className={styles.panel}>
                    <header className={styles.header}>
                        <span>发布到创客次元</span>
                        <button type="button" className={styles.close} onClick={this.handleClose} aria-label="关闭">
                            ×
                        </button>
                    </header>
                    <div className={styles.body}>
                        {body}
                        {error ? <p className={styles.error}>{error}</p> : null}
                        {!error && status && !this.state.busy ? <p className={styles.status}>{status}</p> : null}
                    </div>
                </div>
            </div>
        );
    }
}

PointerPublishModal.propTypes = {
    vm: PropTypes.shape({
        saveProjectSb3: PropTypes.func,
        renderer: PropTypes.object
    }).isRequired,
    projectTitle: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

export default PointerPublishModal;
