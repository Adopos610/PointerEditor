'use strict';

const form = document.getElementById('register-form');
const formError = document.getElementById('form-error');
const formOk = document.getElementById('form-ok');
const captchaButton = document.getElementById('captcha-button');
const submitButton = document.getElementById('submit-button');
const registerCard = document.getElementById('register-card');
const doneCard = document.getElementById('done-card');
const doneText = document.getElementById('done-text');
const doneMessage = document.getElementById('done-message');
const resendButton = document.getElementById('resend-button');

let captchaId = '';
let registeredEmail = '';

const showMessage = (element, text) => {
    element.textContent = text || '';
    element.hidden = !text;
};

const loadCaptcha = async () => {
    try {
        const response = await fetch('/api/captcha', {cache: 'no-store'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '验证码加载失败');
        captchaId = data.id;
        captchaButton.textContent = '';
        const image = document.createElement('img');
        image.src = data.image;
        image.alt = '图形验证码';
        captchaButton.appendChild(image);
        const input = form.elements.captchaAnswer;
        input.value = '';
    } catch (error) {
        captchaId = '';
        captchaButton.textContent = '点击重试';
    }
};

captchaButton.addEventListener('click', loadCaptcha);

form.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage(formError, '');
    showMessage(formOk, '');
    const values = {
        username: form.elements.username.value.trim(),
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
        confirm: form.elements.confirm.value,
        captchaAnswer: form.elements.captchaAnswer.value.trim()
    };
    if (!/^[A-Za-z0-9_]{3,20}$/.test(values.username)) {
        showMessage(formError, '用户名需为 3-20 位字母、数字或下划线');
        return;
    }
    if (!values.email) {
        showMessage(formError, '请填写邮箱');
        return;
    }
    if (values.password.length < 8) {
        showMessage(formError, '密码至少 8 位');
        return;
    }
    if (values.password !== values.confirm) {
        showMessage(formError, '两次输入的密码不一致');
        return;
    }
    if (!captchaId) {
        showMessage(formError, '验证码尚未加载，请点击图片重试');
        return;
    }
    submitButton.disabled = true;
    submitButton.textContent = '正在注册…';
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: values.username,
                email: values.email,
                password: values.password,
                captchaId,
                captchaAnswer: values.captchaAnswer
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '注册失败');
        registeredEmail = values.email;
        registerCard.hidden = true;
        doneCard.hidden = false;
        doneText.textContent = `验证邮件已发送到 ${values.email}。请点击邮件中的链接完成邮箱验证，之后即可回到 PointerEditor 登录协作。`;
    } catch (error) {
        showMessage(formError, error.message);
        await loadCaptcha();
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '注册';
    }
});

resendButton.addEventListener('click', async () => {
    if (!registeredEmail) return;
    resendButton.disabled = true;
    resendButton.textContent = '正在发送…';
    doneMessage.className = 'md-message ok';
    showMessage(doneMessage, '');
    try {
        const response = await fetch('/api/resend-verification', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email: registeredEmail})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '发送失败');
        doneMessage.className = 'md-message ok';
        showMessage(doneMessage, data.message || '如果该邮箱已注册，验证邮件会很快送达');
    } catch (error) {
        doneMessage.className = 'md-message error';
        showMessage(doneMessage, error.message || '发送失败，请稍后再试');
    } finally {
        resendButton.disabled = false;
        resendButton.textContent = '重新发送验证邮件';
    }
});

loadCaptcha();
