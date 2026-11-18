import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

import styles from './pointer-extension-library.css';
import extensionIcon from '../gui/icon--extensions.svg';

const CATEGORIES = [
    {id: 'all', label: '全部扩展'},
    {id: 'official', label: '官方扩展'},
    {id: 'pointer', label: 'Pointer 精选'},
    {id: 'community', label: '社区精选'},
    {id: 'custom', label: '自定义加载'}
];

const FALLBACK_ICON = extensionIcon;

class PointerExtensionLibrary extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            category: 'all',
            query: ''
        };
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);
    }

    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown (event) {
        if (event.key === 'Escape') {
            this.props.onClose();
        }
    }

    handleOverlayClick (event) {
        if (event.target === event.currentTarget) this.props.onClose();
    }

    isLoaded (item) {
        const {vm} = this.props;
        return Boolean(item.extensionId && vm && vm.extensionManager &&
            vm.extensionManager.isExtensionLoaded(item.extensionId));
    }

    itemMatches (item, query) {
        if (!query) return true;
        const haystack = [
            item.searchText,
            item.extensionId,
            item.author,
            typeof item.name === 'string' ? item.name : '',
            typeof item.description === 'string' ? item.description : ''
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
    }

    renderCard (item) {
        const loaded = this.isLoaded(item);
        const custom = item.extensionId === 'custom_extension';
        const categoryLabel = item.category === 'pointer' ? '官方' :
            (item.category === 'community' ? '社区' : '');
        return (
            <button
                key={`${item.category}-${item.extensionId}`}
                type="button"
                className={styles.card}
                onClick={() => {
                    if (!item.disabled) this.props.onSelect(item);
                }}
                disabled={Boolean(item.disabled)}
            >
                <span className={styles.cardTop}>
                    <img
                        className={styles.cardIcon}
                        src={item.iconURL || item.rawURL || FALLBACK_ICON}
                        alt=""
                        draggable={false}
                        loading="lazy"
                    />
                    <span className={styles.cardHeading}>
                        <strong>{item.name}</strong>
                        <span className={styles.cardMeta}>
                            {categoryLabel ? <em className={styles[`badge${categoryLabel === '官方' ? 'Official' : 'Community'}`]}>{categoryLabel}</em> : null}
                            {item.author ? <span>{item.author}</span> : null}
                        </span>
                    </span>
                </span>
                <span className={styles.cardDescription}>
                    {item.description}
                </span>
                <span className={styles.cardFooter}>
                    <span className={styles.cardAction}>
                        {custom ? '打开' : (loaded ? '打开' : '添加')}
                    </span>
                    {loaded && !custom ? <span className={styles.loadedTag}>已添加</span> : null}
                    {item.featured && item.category !== 'official' ? <span className={styles.star}>✦ 精选</span> : null}
                </span>
            </button>
        );
    }

    render () {
        const {items} = this.props;
        const query = this.state.query.trim().toLowerCase();
        const counts = items.reduce((accumulator, item) => {
            accumulator[item.category] = (accumulator[item.category] || 0) + 1;
            accumulator.all += 1;
            return accumulator;
        }, {all: 0});
        const visibleItems = items.filter(item => (
            (this.state.category === 'all' || item.category === this.state.category) &&
            this.itemMatches(item, query)
        ));
        const activeCategory = CATEGORIES.find(item => item.id === this.state.category) || CATEGORIES[0];
        return ReactDOM.createPortal(
            <div className={styles.overlay} role="dialog" aria-modal="true" onMouseDown={this.handleOverlayClick}>
                <div className={styles.panel}>
                    <header className={styles.header}>
                        <div className={styles.brandText}>
                            <strong>PointerEditor 扩展库</strong>
                            <span>官方扩展与社区精选，安装后直接出现在积木区</span>
                        </div>
                        <label className={styles.search}>
                            <span className={styles.searchIcon}>⌕</span>
                            <input
                                value={this.state.query}
                                onChange={event => this.setState({query: event.target.value})}
                                placeholder="搜索扩展、作者…"
                                spellCheck={false}
                            />
                        </label>
                        <button
                            type="button"
                            className={styles.backButton}
                            onClick={this.props.onClose}
                        >
                            ← 返回编辑器
                        </button>
                    </header>
                    <div className={styles.body}>
                        <aside className={styles.sidebar}>
                            <div className={styles.sidebarLabel}>分类</div>
                            <nav className={styles.nav}>
                                {CATEGORIES.map(category => (
                                    <button
                                        key={category.id}
                                        type="button"
                                        className={category.id === this.state.category ? styles.navActive : styles.navItem}
                                        onClick={() => this.setState({category: category.id})}
                                    >
                                        <span>{category.label}</span>
                                        <em>{counts[category.id] || 0}</em>
                                    </button>
                                ))}
                            </nav>
                            <div className={styles.sidebarNote}>
                                社区扩展由原作者维护，安装前请确认来源。扩展只会在本机运行，不会上传作品。
                            </div>
                            <a
                                className={styles.webLink}
                                href="https://pointeritera.github.io/PointerEditor/extensions/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                在浏览器打开扩展库 ↗
                            </a>
                        </aside>
                        <section className={styles.content}>
                            <div className={styles.contentHead}>
                                <strong>{activeCategory.label}</strong>
                                <span>{visibleItems.length} 个扩展</span>
                            </div>
                            {visibleItems.length ? (
                                <div className={styles.grid}>
                                    {visibleItems.map(item => this.renderCard(item))}
                                </div>
                            ) : (
                                <div className={styles.empty}>
                                    <span>⌕</span>
                                    <p>没有找到匹配的扩展</p>
                                    <small>换一个关键词，或选择其他分类。</small>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>,
            document.body
        );
    }
}

PointerExtensionLibrary.propTypes = {
    items: PropTypes.arrayOf(PropTypes.shape({
        category: PropTypes.string,
        extensionId: PropTypes.string,
        extensionURL: PropTypes.string,
        iconURL: PropTypes.string,
        rawURL: PropTypes.string,
        name: PropTypes.node,
        description: PropTypes.node,
        author: PropTypes.string,
        searchText: PropTypes.string,
        featured: PropTypes.bool,
        disabled: PropTypes.bool
    })).isRequired,
    onClose: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    visible: PropTypes.bool,
    vm: PropTypes.shape({
        extensionManager: PropTypes.object
    })
};

export default PointerExtensionLibrary;
