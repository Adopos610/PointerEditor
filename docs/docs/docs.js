(function () {
    'use strict';

    var NAV = [
        {
            title: '开始',
            items: [
                {
                    id: 'index',
                    label: '欢迎与项目清单',
                    href: './index.html',
                    keywords: '欢迎 指针迭代实验室 实验室 赞助 爱发电 项目 PointerXQ 规划 微信公众号 指针工具箱'
                },
                {
                    id: 'charter',
                    label: '章程与规划',
                    href: './charter.html',
                    keywords: '章程 规划 治理 原则 赞助 资金 开源 社区 路线图 免责声明'
                },
                {
                    id: 'getting-started',
                    label: '快速开始',
                    href: './getting-started.html',
                    keywords: '安装 下载 setup win64 网页版 保存 打开 sb3 文件关联 快捷键'
                }
            ]
        },
        {
            title: '使用指南',
            items: [
                {
                    id: 'editor',
                    label: '编辑器',
                    href: './editor.html',
                    keywords: '积木 舞台 角色 造型 声音 画板 变量 广播 克隆 自制积木 背包'
                },
                {
                    id: 'agent',
                    label: 'PEAgent',
                    href: './agent.html',
                    keywords: 'AI PEAgent DeepSeek OpenAI API Key 模型 深度思考 网页搜索 权限 选择积木 添加文件'
                },
                {
                    id: 'cloud',
                    label: '协作与云服务',
                    href: './cloud.html',
                    keywords: 'PointerE 账号 注册 登录 协作 房间 认领 代码锁定 TODO 多窗口 云服务'
                },
                {
                    id: 'extensions',
                    label: '扩展商店',
                    href: './extensions.html',
                    keywords: '扩展 商店 扩展库 指针工具箱 数学工具 安装 自定义 社区 安全'
                },
                {
                    id: 'publish',
                    label: '发布与桌面版',
                    href: './publish.html',
                    keywords: '创客次元 发布 作品 API Key 封面 下载 桌面版 安装 数据目录 多窗口'
                },
                {
                    id: 'faq',
                    label: '常见问题与更新',
                    href: './faq.html',
                    keywords: 'FAQ 常见问题 更新日志 0.2.2-safety 版本 报错 API 失败 扩展失败 Linux macOS'
                }
            ]
        }
    ];

    var page = document.querySelector('.docs-main');
    var activeId = page ? page.getAttribute('data-page') : '';
    var navRoot = document.getElementById('docsNav');
    var sidebar = document.getElementById('docsSidebar');
    var toggle = document.getElementById('docsMenuToggle');
    var search = document.getElementById('docsSearch');
    var results = document.getElementById('docsSearchResults');

    var flat = NAV.reduce(function (all, group) {
        return all.concat(group.items);
    }, []);

    function renderNav () {
        if (!navRoot) return;
        navRoot.textContent = '';
        NAV.forEach(function (group) {
            var wrapper = document.createElement('div');
            wrapper.className = 'docs-nav-group';
            var title = document.createElement('div');
            title.className = 'docs-nav-title';
            title.textContent = group.title;
            wrapper.appendChild(title);
            group.items.forEach(function (item) {
                var link = document.createElement('a');
                link.href = item.href;
                link.textContent = item.label;
                if (item.id === activeId) link.className = 'active';
                wrapper.appendChild(link);
            });
            navRoot.appendChild(wrapper);
        });
        var support = document.createElement('div');
        support.className = 'docs-sidebar-foot';
        support.innerHTML = '<strong>支持指针迭代实验室</strong>' +
            'API 与服务器成本由实验室自费维持。<br>' +
            '<a href="https://ifdian.net/a/HUGOR" target="_blank" rel="noreferrer">爱发电 · HUGOR ↗</a>';
        navRoot.appendChild(support);
    }

    function renderSearch () {
        if (!results || !search) return;
        var query = search.value.trim().toLowerCase();
        if (!query) {
            results.hidden = true;
            results.textContent = '';
            return;
        }
        var matches = flat.filter(function (item) {
            return (item.label + ' ' + item.keywords).toLowerCase().indexOf(query) !== -1;
        });
        results.textContent = '';
        if (!matches.length) {
            var empty = document.createElement('div');
            empty.className = 'docs-search-empty';
            empty.textContent = '没有找到相关文档';
            results.appendChild(empty);
        } else {
            matches.forEach(function (item) {
                var link = document.createElement('a');
                link.href = item.href;
                link.innerHTML = '<strong>' + item.label + '</strong><small>' +
                    item.keywords.split(' ').slice(0, 6).join(' · ') + '</small>';
                results.appendChild(link);
            });
        }
        results.hidden = false;
    }

    renderNav();

    if (toggle && sidebar) {
        toggle.addEventListener('click', function () {
            sidebar.classList.toggle('open');
        });
        document.addEventListener('click', function (event) {
            if (!sidebar.classList.contains('open')) return;
            if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
            sidebar.classList.remove('open');
        });
    }

    if (search) {
        search.addEventListener('input', renderSearch);
        search.addEventListener('focus', renderSearch);
        document.addEventListener('click', function (event) {
            if (!results) return;
            if (results.contains(event.target) || search.contains(event.target)) return;
            results.hidden = true;
        });
        document.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                search.focus();
            }
            if (event.key === 'Escape') {
                if (results) results.hidden = true;
                if (sidebar) sidebar.classList.remove('open');
            }
        });
    }
})();
