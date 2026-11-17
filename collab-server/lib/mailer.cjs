'use strict';

const store = require('./store.cjs');

let transporter = null;
let transporterKey = '';

const smtpConfig = () => {
    const {smtp} = store.getConfig();
    return smtp && smtp.user && smtp.pass ? smtp : null;
};

const getTransporter = () => {
    const config = smtpConfig();
    if (!config) return null;
    const key = `${config.host}:${config.port}:${config.user}:${config.pass}`;
    if (transporter && transporterKey === key) return transporter;
    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (error) {
        console.error('[mail] nodemailer is not installed; run npm install in collab-server');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: config.host,
        port: Number(config.port),
        secure: Boolean(config.secure),
        auth: {user: config.user, pass: config.pass},
        connectionTimeout: 12000,
        greetingTimeout: 12000,
        socketTimeout: 20000
    });
    transporterKey = key;
    return transporter;
};

const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const verificationHtml = ({username, link}) => `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#eef4ff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d3557;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 12px 32px rgba(9,30,66,.12);">
    <div style="padding:18px 24px;background:linear-gradient(180deg,#3b7ef2,#2f6fe4);color:#ffffff;font-size:18px;font-weight:700;">PointerE 账号验证</div>
    <div style="padding:24px;">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;">${escapeHtml(username)}，你好：</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#3d5a80;">感谢注册 PointerE。点击下面的按钮完成邮箱验证，验证后即可在 PointerEditor「云端 → 在线协作」中使用 PointerE 账号。</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 28px;border-radius:9px;background:#2f6fe4;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">验证邮箱</a>
      </p>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#6b86a8;">按钮无法点击时，请复制下面的链接到浏览器打开：</p>
      <p style="margin:0 0 22px;font-size:12px;line-height:1.6;word-break:break-all;color:#2f6fe4;">${escapeHtml(link)}</p>
      <p style="margin:0;font-size:12px;line-height:1.7;color:#8aa2c0;">链接 24 小时内有效。如果这不是你本人的操作，请忽略这封邮件。</p>
    </div>
  </div>
</body>
</html>`;

const sendVerification = async ({email, username, link}) => {
    const transport = getTransporter();
    if (!transport) return {ok: false, configured: false};
    const config = smtpConfig();
    try {
        await transport.sendMail({
            from: `"PointerE" <${config.user}>`,
            to: email,
            subject: '验证你的 PointerE 账号',
            text: `${username}，你好：\n\n请打开下面的链接完成 PointerE 账号验证（24 小时内有效）：\n${link}\n\n如果这不是你本人的操作，请忽略这封邮件。`,
            html: verificationHtml({username, link})
        });
        return {ok: true, configured: true};
    } catch (error) {
        console.error('[mail] send failed:', error && error.message);
        return {ok: false, configured: true, error: error && error.message};
    }
};

const verifyConnection = async () => {
    const transport = getTransporter();
    if (!transport) return {ok: false, configured: false};
    try {
        await transport.verify();
        return {ok: true, configured: true};
    } catch (error) {
        return {ok: false, configured: true, error: error && error.message};
    }
};

module.exports = {sendVerification, verifyConnection, smtpConfig};
