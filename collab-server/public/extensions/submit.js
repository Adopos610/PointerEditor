(function () {
    'use strict';

    var form = document.getElementById('submit-form');
    var button = document.getElementById('submit-button');
    var message = document.getElementById('submit-message');
    var captchaButton = document.getElementById('captcha-button');
    var iconPreview = document.getElementById('icon-preview');
    var iconPreviewImage = iconPreview.querySelector('img');
    var captchaId = '';
    var sourceText = '';
    var sourceName = '';
    var iconData = '';

    function show (text, type) {
        message.textContent = text || '';
        message.className = 'submit-message' + (type ? ' ' + type : '');
    }

    function readAsText (file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(new Error('读取 JS 文件失败')); };
            reader.readAsText(file);
        });
    }

    function readAsDataURL (file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(new Error('读取扩展图片失败')); };
            reader.readAsDataURL(file);
        });
    }

    async function loadCaptcha () {
        captchaButton.textContent = '加载中…';
        try {
            var response = await fetch('/api/captcha', {cache: 'no-store'});
            var data = await response.json();
            if (!response.ok) throw new Error(data.error || '验证码加载失败');
            captchaId = data.id;
            captchaButton.textContent = '';
            var image = document.createElement('img');
            image.src = data.image;
            image.alt = '图形验证码';
            captchaButton.appendChild(image);
            form.elements.captchaAnswer.value = '';
        } catch (error) {
            captchaButton.textContent = '点击重试';
            show(error.message, 'error');
        }
    }

    captchaButton.addEventListener('click', loadCaptcha);

    form.elements.sourceFile.addEventListener('change', async function () {
        var file = form.elements.sourceFile.files[0];
        sourceText = '';
        sourceName = '';
        if (!file) return;
        if (file.size > 512 * 1024) {
            show('JS 文件不能超过 512KB', 'error');
            form.elements.sourceFile.value = '';
            return;
        }
        try {
            sourceText = await readAsText(file);
            sourceName = file.name;
            show('已读取 JS 文件：' + file.name);
        } catch (error) {
            show(error.message, 'error');
        }
    });

    form.elements.iconFile.addEventListener('change', async function () {
        var file = form.elements.iconFile.files[0];
        iconData = '';
        iconPreview.hidden = true;
        if (!file) return;
        if (file.size > 256 * 1024) {
            show('扩展图片不能超过 256KB', 'error');
            form.elements.iconFile.value = '';
            return;
        }
        try {
            iconData = await readAsDataURL(file);
            iconPreviewImage.src = iconData;
            iconPreview.hidden = false;
        } catch (error) {
            show(error.message, 'error');
        }
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var sourceUrl = String(data.get('sourceUrl') || '').trim();
        if (!sourceText && !sourceUrl) {
            show('请上传 JS 文件或填写扩展地址', 'error');
            return;
        }
        var payload = {
            extensionId: String(data.get('extensionId') || '').trim(),
            name: String(data.get('name') || '').trim(),
            author: String(data.get('author') || '').trim(),
            contact: String(data.get('contact') || '').trim(),
            description: String(data.get('description') || '').trim(),
            sourceUrl,
            sourceText,
            sourceName,
            iconData,
            tags: String(data.get('tags') || '').trim(),
            captchaId: captchaId,
            captchaAnswer: String(data.get('captchaAnswer') || '').trim()
        };
        if (!captchaId) {
            show('请先获取图形验证码', 'error');
            return;
        }
        button.disabled = true;
        show('正在校验扩展文件并提交…');
        try {
            var response = await fetch('/api/extensions/submit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            var result = await response.json();
            if (!response.ok) throw new Error(result.error || '提交失败');
            show('提交成功，审核通过后会出现在社区扩展中。审核期间可以关闭此页面。', 'ok');
            form.reset();
            sourceText = '';
            sourceName = '';
            iconData = '';
            iconPreview.hidden = true;
            loadCaptcha();
        } catch (error) {
            show(error.message || '提交失败', 'error');
            loadCaptcha();
        } finally {
            button.disabled = false;
            if (!captchaId) loadCaptcha();
        }
    });

    loadCaptcha();
})();
