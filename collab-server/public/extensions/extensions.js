(function () {
    'use strict';

    var state = {
        items: [],
        category: 'all',
        query: ''
    };

    var categories = [
        {id: 'all', label: '全部扩展'},
        {id: 'pointer', label: '官方扩展'},
        {id: 'community', label: '社区精选'}
    ];

    var grid = document.getElementById('extGrid');
    var nav = document.getElementById('extNav');
    var count = document.getElementById('extCount');
    var title = document.getElementById('extCategory');
    var empty = document.getElementById('extEmpty');
    var search = document.getElementById('extSearch');
    var toast = document.getElementById('extToast');
    var toastTimer = null;
    var fallbackIcon = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">' +
        '<rect width="44" height="44" rx="10" fill="#e8f2ff"/>' +
        '<path d="M22 12v20M12 22h20" stroke="#2f6fe4" stroke-width="3" stroke-linecap="round"/>' +
        '</svg>'
    );

    function showToast (message) {
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, 1800);
    }

    function copyText (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                showToast('安装地址已复制');
            }).catch(function () {
                legacyCopy(text);
            });
            return;
        }
        legacyCopy(text);
    }

    function legacyCopy (text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('安装地址已复制');
        } catch (error) {
            showToast('复制失败，请手动选择地址');
        }
        document.body.removeChild(textarea);
    }

    function getVisibleItems () {
        var query = state.query.trim().toLowerCase();
        return state.items.filter(function (item) {
            if (state.category !== 'all' && item.category !== state.category) return false;
            if (!query) return true;
            return [item.name, item.description, item.author, item.id]
                .join(' ')
                .toLowerCase()
                .indexOf(query) !== -1;
        });
    }

    function createCard (item) {
        var card = document.createElement('article');
        card.className = 'ext-card';

        var top = document.createElement('div');
        top.className = 'ext-card-top';

        var icon = document.createElement('img');
        icon.className = 'ext-card-icon';
        icon.alt = '';
        icon.loading = 'lazy';
        icon.src = 'icons/' + item.icon;
        icon.addEventListener('error', function () {
            icon.src = fallbackIcon;
        });
        top.appendChild(icon);

        var heading = document.createElement('div');
        heading.className = 'ext-card-title';
        var name = document.createElement('strong');
        name.textContent = item.name;
        heading.appendChild(name);

        var meta = document.createElement('div');
        meta.className = 'ext-card-meta';
        var badge = document.createElement('em');
        badge.className = 'ext-badge ' + (item.category === 'pointer' ? 'official' : 'community');
        badge.textContent = item.category === 'pointer' ? '官方' : '社区';
        meta.appendChild(badge);
        var author = document.createElement('span');
        author.textContent = item.author || '社区作者';
        meta.appendChild(author);
        heading.appendChild(meta);
        top.appendChild(heading);
        card.appendChild(top);

        var description = document.createElement('p');
        description.className = 'ext-card-desc';
        description.textContent = item.description;
        card.appendChild(description);

        var footer = document.createElement('div');
        footer.className = 'ext-card-footer';
        var install = document.createElement('button');
        install.type = 'button';
        install.className = 'ext-install';
        install.textContent = '复制安装地址';
        install.addEventListener('click', function () {
            copyText(new URL(item.url, location.href).href);
        });
        footer.appendChild(install);
        if (item.featured) {
            var star = document.createElement('span');
            star.className = 'ext-featured';
            star.textContent = '✦ 精选';
            footer.appendChild(star);
        }
        card.appendChild(footer);
        return card;
    }

    function render () {
        var visible = getVisibleItems();
        var counts = {all: state.items.length, pointer: 0, community: 0};
        state.items.forEach(function (item) {
            if (counts[item.category] !== undefined) counts[item.category] += 1;
        });

        nav.textContent = '';
        categories.forEach(function (category) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = category.id === state.category ? 'active' : '';
            var label = document.createElement('span');
            label.textContent = category.label;
            button.appendChild(label);
            var number = document.createElement('em');
            number.textContent = counts[category.id] || 0;
            button.appendChild(number);
            button.addEventListener('click', function () {
                state.category = category.id;
                render();
            });
            nav.appendChild(button);
        });

        var active = categories.filter(function (category) {
            return category.id === state.category;
        })[0] || categories[0];
        title.textContent = active.label;
        count.textContent = visible.length + ' 个扩展';
        grid.textContent = '';
        visible.forEach(function (item) {
            grid.appendChild(createCard(item));
        });
        empty.hidden = visible.length > 0;
    }

    search.addEventListener('input', function (event) {
        state.query = event.target.value;
        render();
    });

    fetch('catalog.json', {cache: 'no-cache'})
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function (data) {
            state.items = Array.isArray(data.items) ? data.items : [];
            render();
        })
        .catch(function () {
            empty.hidden = false;
            grid.textContent = '';
            title.textContent = '加载失败';
            count.textContent = '';
            showToast('扩展库暂时无法加载');
        });
})();
