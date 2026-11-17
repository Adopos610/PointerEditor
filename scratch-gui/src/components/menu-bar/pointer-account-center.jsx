import PropTypes from 'prop-types';
import React from 'react';

import {
    REGISTER_URL,
    clearAccount,
    fetchMe,
    fetchPointerPoints,
    getAccount,
    loginAccount,
    logoutAccount,
    redeemMallProduct,
    saveAccount,
    saveShippingAddress
} from '../../lib/pointer-account';
import styles from './pointer-account-center.css';

const LAST_ACCOUNT_KEY = 'pointere.lastAccount';
const EMPTY_ADDRESS = {name: '', phone: '', detail: ''};

const formatTime = value => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return '—';
    }
};

const statusText = status => ({
    pending: '待发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消'
}[status] || status);

class PointerAccountCenter extends React.Component {
    constructor (props) {
        super(props);
        const account = getAccount();
        this.state = {
            phase: account && account.token ? 'loading' : 'login',
            account,
            summary: null,
            tab: 'points',
            loginAccount: localStorage.getItem(LAST_ACCOUNT_KEY) || '',
            loginPassword: '',
            authBusy: false,
            loginError: '',
            needsVerification: false,
            loading: false,
            error: '',
            message: '',
            checkoutProduct: null,
            address: {...EMPTY_ADDRESS},
            addressEditing: false,
            redeeming: false
        };
        this.handleLogin = this.handleLogin.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
        this.loadPoints = this.loadPoints.bind(this);
        this.handleCheckout = this.handleCheckout.bind(this);
        this.handleRedeem = this.handleRedeem.bind(this);
        this.handleSaveAddress = this.handleSaveAddress.bind(this);
        this.handleOpenRegister = this.handleOpenRegister.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        if (this.state.account && this.state.account.token) {
            this.loadPoints(this.state.account);
        }
    }

    componentWillUnmount () {
        this.mounted = false;
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
        loginAccount(accountName, password)
            .then(data => {
                saveAccount(data.token, data.user);
                localStorage.setItem(LAST_ACCOUNT_KEY, accountName);
                if (!this.mounted) return;
                const account = {token: data.token, user: data.user};
                this.setState({
                    account,
                    authBusy: false,
                    loginPassword: '',
                    phase: 'loading'
                }, () => this.loadPoints(account));
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
        const account = this.state.account;
        if (account && account.token) {
            logoutAccount(account.token).catch(() => {});
        }
        clearAccount();
        this.setState({
            phase: 'login',
            account: null,
            summary: null,
            loginPassword: '',
            checkoutProduct: null,
            tab: 'points',
            error: '',
            message: ''
        });
    }

    loadPoints (account) {
        if (!account || !account.token) return;
        this.setState({loading: true, error: '', message: ''});
        Promise.all([
            fetchMe(account.token).catch(error => {
                if (error.status === 401 || error.status === 403) throw error;
                return {user: account.user};
            }),
            fetchPointerPoints(account.token)
        ])
            .then(([me, summary]) => {
                if (!this.mounted) return;
                const nextAccount = {token: account.token, user: me.user || account.user};
                saveAccount(nextAccount.token, nextAccount.user);
                const address = summary.address || EMPTY_ADDRESS;
                this.setState({
                    phase: 'dashboard',
                    account: nextAccount,
                    summary,
                    address: {...address},
                    loading: false,
                    error: ''
                });
            })
            .catch(error => {
                if (!this.mounted) return;
                if (error.status === 401 || error.status === 403) {
                    clearAccount();
                    this.setState({
                        phase: 'login',
                        account: null,
                        summary: null,
                        loading: false,
                        loginError: '登录状态已失效，请重新登录'
                    });
                    return;
                }
                this.setState({
                    phase: 'dashboard',
                    loading: false,
                    error: error.message
                });
            });
    }

    handleOpenRegister () {
        window.open(REGISTER_URL, '_blank', 'noopener');
    }

    handleCheckout (product) {
        this.setState(prev => ({
            checkoutProduct: product,
            address: {...EMPTY_ADDRESS, ...(prev.summary && prev.summary.address ? prev.summary.address : {})},
            addressEditing: true,
            error: '',
            message: ''
        }));
    }

    handleRedeem (event) {
        event.preventDefault();
        const {checkoutProduct, address, account, summary} = this.state;
        if (!checkoutProduct || !account) return;
        if (!address.name.trim() || !address.phone.trim() || !address.detail.trim()) {
            this.setState({error: '请填写收货人、手机号和详细地址'});
            return;
        }
        const product = (summary && summary.products || []).find(item => item.id === checkoutProduct.id);
        if (product && product.stock <= 0) {
            this.setState({error: '该商品已兑完'});
            return;
        }
        if (summary && summary.points < checkoutProduct.points) {
            this.setState({error: '积分不足，继续写代码或参与活动攒积分吧'});
            return;
        }
        this.setState({redeeming: true, error: ''});
        redeemMallProduct(account.token, checkoutProduct.id, address)
            .then(result => {
                if (!this.mounted) return;
                window.dispatchEvent(new CustomEvent('pointere-points-changed', {
                    detail: {points: result.points}
                }));
                this.setState({
                    summary: result.summary,
                    checkoutProduct: null,
                    addressEditing: false,
                    redeeming: false,
                    tab: 'orders',
                    message: `兑换成功：${checkoutProduct.name}，请等待发货`
                });
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({redeeming: false, error: error.message});
            });
    }

    handleSaveAddress (event) {
        event.preventDefault();
        const {account, address} = this.state;
        if (!account) return;
        saveShippingAddress(account.token, address)
            .then(result => {
                if (!this.mounted) return;
                this.setState(prev => ({
                    summary: {...prev.summary, address: result.address},
                    addressEditing: false,
                    message: '收货地址已保存'
                }));
            })
            .catch(error => {
                if (!this.mounted) return;
                this.setState({error: error.message});
            });
    }

    renderAddressForm (onSubmit, submitLabel) {
        const {address, redeeming} = this.state;
        return (
            <form className={styles.addressForm} onSubmit={onSubmit}>
                <label className={styles.field}>
                    <span>收货人</span>
                    <input
                        value={address.name}
                        onChange={e => this.setState({address: {...address, name: e.target.value}})}
                        maxLength={40}
                        placeholder="真实姓名"
                    />
                </label>
                <label className={styles.field}>
                    <span>手机号</span>
                    <input
                        value={address.phone}
                        onChange={e => this.setState({address: {...address, phone: e.target.value}})}
                        maxLength={30}
                        placeholder="用于快递联系"
                    />
                </label>
                <label className={styles.field}>
                    <span>详细地址</span>
                    <textarea
                        value={address.detail}
                        onChange={e => this.setState({address: {...address, detail: e.target.value}})}
                        maxLength={300}
                        rows={3}
                        placeholder="省 / 市 / 区 / 街道 / 门牌号"
                    />
                </label>
                <div className={styles.actions}>
                    <button type="submit" className={styles.primary} disabled={redeeming}>
                        {redeeming ? '提交中…' : submitLabel}
                    </button>
                    <button type="button" className={styles.secondary} onClick={() => this.setState({
                        addressEditing: false,
                        checkoutProduct: null,
                        error: ''
                    })}>
                        取消
                    </button>
                </div>
            </form>
        );
    }

    renderLogin () {
        const {loginAccount, loginPassword, authBusy, loginError, needsVerification} = this.state;
        return (
            <div className={styles.loginWrap}>
                <div className={styles.loginIntro}>
                    <span className={styles.loginMark}>P</span>
                    <div>
                        <h2>登录 PointerE</h2>
                        <p>查看积分、奖励和积分商城。PointerE 账号与创客次元账号相互独立。</p>
                    </div>
                </div>
                <form className={styles.loginForm} onSubmit={this.handleLogin}>
                    <label className={styles.field}>
                        <span>用户名或邮箱</span>
                        <input
                            value={loginAccount}
                            onChange={e => this.setState({loginAccount: e.target.value})}
                            autoComplete="username"
                            spellCheck={false}
                            disabled={authBusy}
                        />
                    </label>
                    <label className={styles.field}>
                        <span>密码</span>
                        <input
                            type="password"
                            value={loginPassword}
                            onChange={e => this.setState({loginPassword: e.target.value})}
                            autoComplete="current-password"
                            disabled={authBusy}
                        />
                    </label>
                    {loginError ? <p className={styles.error}>{loginError}</p> : null}
                    {needsVerification ? (
                        <p className={styles.hint}>请先打开注册邮箱完成验证，验证通过后注册奖励会自动到账。</p>
                    ) : null}
                    <div className={styles.actions}>
                        <button type="submit" className={styles.primary} disabled={authBusy}>
                            {authBusy ? '登录中…' : '登录'}
                        </button>
                        <button type="button" className={styles.secondary} onClick={this.handleOpenRegister}>
                            注册 PointerE
                        </button>
                    </div>
                    <p className={styles.hint}>注册完成邮箱验证后获得 100 积分；每天第一次写代码再获得 10 积分。</p>
                </form>
            </div>
        );
    }

    renderPointsTab () {
        const {summary, address, addressEditing} = this.state;
        if (!summary) return null;
        return (
            <div className={styles.tabPane}>
                <div className={styles.pointsHero}>
                    <div>
                        <span className={styles.pointsLabel}>当前积分</span>
                        <strong className={styles.pointsValue}>{summary.points}</strong>
                    </div>
                    <div className={styles.pointsStats}>
                        <span className={summary.registration.awarded ? styles.statDone : styles.statPending}>
                            注册奖励 +{summary.registration.amount}
                        </span>
                        <span className={summary.dailyCode.claimed ? styles.statDone : styles.statPending}>
                            今日代码 +{summary.dailyCode.amount}
                        </span>
                    </div>
                </div>
                <div className={styles.rewardGrid}>
                    <div className={styles.rewardCard}>
                        <span className={styles.rewardIcon}>✦</span>
                        <div>
                            <strong>注册奖励</strong>
                            <p>完成邮箱验证后自动到账 +{summary.registration.amount} 积分。</p>
                        </div>
                        <span className={summary.registration.awarded ? styles.badgeDone : styles.badgePending}>
                            {summary.registration.awarded ? '已到账' : '待发放'}
                        </span>
                    </div>
                    <div className={styles.rewardCard}>
                        <span className={styles.rewardIcon}>⌘</span>
                        <div>
                            <strong>每日代码奖励</strong>
                            <p>每天第一次编辑积木自动到账 +{summary.dailyCode.amount} 积分。</p>
                        </div>
                        <span className={summary.dailyCode.claimed ? styles.badgeDone : styles.badgePending}>
                            {summary.dailyCode.claimed ? '今日已领取' : '写代码即可领取'}
                        </span>
                    </div>
                </div>
                <div className={styles.section}>
                    <div className={styles.sectionHead}>
                        <h3>收货地址</h3>
                        <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => this.setState({addressEditing: !addressEditing, error: ''})}
                        >
                            {addressEditing ? '收起' : (address.name ? '修改' : '添加地址')}
                        </button>
                    </div>
                    {addressEditing ? this.renderAddressForm(this.handleSaveAddress, '保存地址') : (
                        address.name ? (
                            <div className={styles.addressCard}>
                                <strong>{address.name} · {address.phone}</strong>
                                <span>{address.detail}</span>
                            </div>
                        ) : (
                            <p className={styles.hint}>兑换实物商品前需要填写收货地址。</p>
                        )
                    )}
                </div>
                <div className={styles.section}>
                    <div className={styles.sectionHead}><h3>积分明细</h3><span>{summary.history.length} 条</span></div>
                    {summary.history.length ? (
                        <ul className={styles.historyList}>
                            {summary.history.map(item => (
                                <li key={item.id}>
                                    <span className={item.delta > 0 ? styles.deltaPlus : styles.deltaMinus}>
                                        {item.delta > 0 ? '+' : ''}{item.delta}
                                    </span>
                                    <span className={styles.historyReason}>{item.reason}</span>
                                    <time>{formatTime(item.at)}</time>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.empty}>还没有积分记录。</p>
                    )}
                </div>
                <p className={styles.hint}>积分规则：注册验证 +100，每日首次写代码 +10。积分可以在「积分商城」兑换实物。</p>
            </div>
        );
    }

    renderMallTab () {
        const {summary, checkoutProduct} = this.state;
        if (!summary) return null;
        if (checkoutProduct) {
            return (
                <div className={styles.tabPane}>
                    <button type="button" className={styles.linkButton} onClick={() => this.setState({
                        checkoutProduct: null,
                        error: ''
                    })}>
                        ← 返回商城
                    </button>
                    <div className={styles.checkoutCard}>
                        <span className={styles.productIconLarge}>{checkoutProduct.icon}</span>
                        <div>
                            <h3>{checkoutProduct.name}</h3>
                            <p>{checkoutProduct.description}</p>
                            <strong>{checkoutProduct.points} 积分</strong>
                            <span>当前积分 {summary.points}</span>
                        </div>
                    </div>
                    <div className={styles.sectionHead}><h3>填写收货信息</h3><span>实物商品需要邮寄</span></div>
                    {this.renderAddressForm(this.handleRedeem, '确认兑换')}
                    <p className={styles.hint}>兑换后积分立即扣除，订单会进入待发货状态。</p>
                </div>
            );
        }
        return (
            <div className={styles.tabPane}>
                <div className={styles.mallHead}>
                    <div><h3>积分商城</h3><p>用写代码攒下的积分，换一点真实的东西。</p></div>
                    <strong>{summary.points} 积分</strong>
                </div>
                <div className={styles.productGrid}>
                    {summary.products.map(product => {
                        const soldOut = product.stock <= 0;
                        const affordable = summary.points >= product.points;
                        return (
                            <article key={product.id} className={styles.productCard}>
                                <span className={styles.productIcon}>{product.icon}</span>
                                <h4>{product.name}</h4>
                                <p>{product.description}</p>
                                <div className={styles.productMeta}>
                                    <strong>{product.points} 积分</strong>
                                    <span>{soldOut ? '已兑完' : `库存 ${product.stock}`}</span>
                                </div>
                                <button
                                    type="button"
                                    className={styles.primary}
                                    disabled={soldOut || !affordable}
                                    onClick={() => this.handleCheckout(product)}
                                >
                                    {soldOut ? '已兑完' : (affordable ? '兑换' : '积分不足')}
                                </button>
                            </article>
                        );
                    })}
                </div>
                <p className={styles.hint}>积分商城为实物兑换，兑换前请确认收货信息。发货进度可在「订单」中查看。</p>
            </div>
        );
    }

    renderOrdersTab () {
        const {summary} = this.state;
        if (!summary) return null;
        return (
            <div className={styles.tabPane}>
                <div className={styles.sectionHead}><h3>兑换订单</h3><span>{summary.orders.length} 个</span></div>
                {summary.orders.length ? (
                    <ul className={styles.orderList}>
                        {summary.orders.map(order => (
                            <li key={order.id}>
                                <span className={styles.productIconSmall}>{order.productIcon}</span>
                                <div className={styles.orderMain}>
                                    <strong>{order.productName}</strong>
                                    <span>{order.points} 积分 · {formatTime(order.createdAt)}</span>
                                    <span>{order.address.name} · {order.address.phone} · {order.address.detail}</span>
                                </div>
                                <span className={styles.orderStatus}>{statusText(order.status)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className={styles.empty}>还没有兑换记录，去积分商城看看吧。</p>
                )}
            </div>
        );
    }

    renderDashboard () {
        const {account, summary, tab, loading, error, message, phase} = this.state;
        if (!account) return null;
        const user = account.user || {};
        const initial = String(user.nickname || user.username || 'P').slice(0, 1).toUpperCase();
        return (
            <div className={styles.dashboard}>
                <div className={styles.accountHeader}>
                    <span className={styles.avatar}>{initial}</span>
                    <div className={styles.identity}>
                        <strong>{user.nickname || user.username}</strong>
                        <span>@{user.username} · PointerE 账号</span>
                    </div>
                    <div className={styles.accountActions}>
                        <button type="button" className={styles.secondary} onClick={() => this.loadPoints(account)} disabled={loading}>
                            {loading ? '刷新中…' : '刷新'}
                        </button>
                        <button type="button" className={styles.linkButton} onClick={this.handleLogout}>退出登录</button>
                    </div>
                </div>
                <div className={styles.tabs}>
                    <button type="button" className={tab === 'points' ? styles.tabActive : styles.tab} onClick={() => this.setState({tab: 'points', error: '', message: ''})}>积分</button>
                    <button type="button" className={tab === 'mall' ? styles.tabActive : styles.tab} onClick={() => this.setState({tab: 'mall', error: '', message: ''})}>积分商城</button>
                    <button type="button" className={tab === 'orders' ? styles.tabActive : styles.tab} onClick={() => this.setState({tab: 'orders', error: '', message: ''})}>订单</button>
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
                {message ? <p className={styles.success}>{message}</p> : null}
                {phase === 'loading' || !summary ? (
                    <div className={styles.loadingState}>{loading ? '正在加载积分…' : '暂时没有数据'}</div>
                ) : (
                    tab === 'points' ? this.renderPointsTab() : tab === 'mall' ? this.renderMallTab() : this.renderOrdersTab()
                )}
            </div>
        );
    }

    render () {
        const {phase} = this.state;
        return (
            <div className={styles.overlay} role="dialog" aria-modal="true">
                <div className={styles.panel}>
                    <header className={styles.header}>
                        <div><span className={styles.headerKicker}>PointerE</span><h1>个人中心</h1></div>
                        <button type="button" className={styles.close} onClick={this.props.onClose} aria-label="关闭">×</button>
                    </header>
                    <div className={styles.body}>
                        {phase === 'login' ? this.renderLogin() : this.renderDashboard()}
                    </div>
                </div>
            </div>
        );
    }
}

PointerAccountCenter.propTypes = {
    onClose: PropTypes.func.isRequired
};

export default PointerAccountCenter;
