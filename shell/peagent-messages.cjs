'use strict';

const MAX_MESSAGES = 40;
const MAX_TEXT_PER_MESSAGE = 24000;
const MAX_SYSTEM_TEXT = 32000;
const MAX_TOTAL_TEXT = 120000;
const MAX_IMAGES_PER_MESSAGE = 2;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

const textOf = content => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter(part => part && part.type === 'text')
        .map(part => String(part.text || ''))
        .join('\n');
};

const imageBytesOf = content => {
    if (!Array.isArray(content)) return 0;
    return content.reduce((total, part) => (
        total + (part && part.type === 'image' ? Number(part.bytes) || 0 : 0)
    ), 0);
};

const normalizeMime = mime => (
    String(mime || '').toLowerCase() === 'image/jpg' ? 'image/jpeg' : String(mime || '').toLowerCase()
);

const parseImageDataUrl = value => {
    const match = IMAGE_DATA_URL_RE.exec(String(value || ''));
    if (!match) return null;
    const mime = normalizeMime(match[1]);
    const data = match[2].replace(/\s+/g, '');
    if (!data) return null;
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) return null;
    return {mime, data, bytes};
};

const normalizeContent = (content, maxText = MAX_TEXT_PER_MESSAGE) => {
    if (typeof content === 'string') {
        return content.slice(0, maxText);
    }
    if (!Array.isArray(content)) return '';
    const parts = [];
    let textLength = 0;
    let imageCount = 0;
    for (const part of content) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text') {
            if (textLength >= maxText) break;
            const text = String(part.text || '').slice(0, maxText - textLength);
            if (!text) continue;
            textLength += text.length;
            parts.push({type: 'text', text});
            continue;
        }
        if (part.type !== 'image' && part.type !== 'image_url') continue;
        if (imageCount >= MAX_IMAGES_PER_MESSAGE) break;
        const raw = part.type === 'image_url' ? (part.image_url && part.image_url.url) : part.dataUrl;
        const image = parseImageDataUrl(raw);
        if (!image) continue;
        imageCount += 1;
        parts.push({type: 'image', ...image});
    }
    if (!imageCount) {
        return parts.filter(part => part.type === 'text').map(part => part.text).join('\n');
    }
    return parts;
};

const prepareMessages = rawMessages => {
    const list = Array.isArray(rawMessages) ? rawMessages : [];
    if (!list.length) return {error: '消息为空'};
    if (list.length > MAX_MESSAGES) return {error: '会话过长，请新建会话'};
    const messages = [];
    let totalText = 0;
    let totalImageBytes = 0;
    for (const item of list) {
        const role = ['system', 'user', 'assistant'].includes(item && item.role) ? item.role : 'user';
        let content = normalizeContent(
            item && item.content,
            role === 'system' ? MAX_SYSTEM_TEXT : MAX_TEXT_PER_MESSAGE
        );
        if (role === 'system') content = textOf(content);
        const text = textOf(content);
        const imageBytes = imageBytesOf(content);
        totalText += text.length;
        totalImageBytes += imageBytes;
        if (totalText > MAX_TOTAL_TEXT) return {error: '会话内容过长，请新建会话'};
        if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) return {error: '图片总量过大，请减少图片数量或尺寸'};
        if (!text && !imageBytes) continue;
        messages.push({role, content});
    }
    if (!messages.length) return {error: '消息为空'};
    return {messages};
};

const toOpenAIContent = content => {
    if (typeof content === 'string') return content;
    return content.map(part => (
        part.type === 'text' ?
            {type: 'text', text: part.text} :
            {type: 'image_url', image_url: {url: `data:${part.mime};base64,${part.data}`}}
    ));
};

const toAnthropicContent = content => {
    if (typeof content === 'string') return content;
    return content.map(part => (
        part.type === 'text' ?
            {type: 'text', text: part.text} :
            {type: 'image', source: {type: 'base64', media_type: part.mime, data: part.data}}
    ));
};

module.exports = {
    prepareMessages,
    toOpenAIContent,
    toAnthropicContent
};
