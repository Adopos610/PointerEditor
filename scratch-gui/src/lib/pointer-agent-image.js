const MAX_IMAGE_SIDE = 1280;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 2500000;
const STAGE_SNAPSHOT_TIMEOUT = 3000;

const requestStageSnapshot = vm => new Promise(resolve => {
    if (!vm || !vm.renderer || typeof vm.renderer.requestSnapshot !== 'function') {
        resolve(null);
        return;
    }
    let settled = false;
    const finish = dataUrl => {
        if (settled) return;
        settled = true;
        resolve(dataUrl && /^data:image\//i.test(dataUrl) ? dataUrl : null);
    };
    const timer = setTimeout(() => finish(null), STAGE_SNAPSHOT_TIMEOUT);
    try {
        vm.renderer.requestSnapshot(dataUrl => {
            clearTimeout(timer);
            finish(dataUrl);
        });
        if (typeof vm.renderer.draw === 'function') vm.renderer.draw();
    } catch (error) {
        clearTimeout(timer);
        finish(null);
    }
});

const loadImage = source => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取图片'));
    image.src = source;
});

export const prepareImageDataUrl = async (dataUrl, maxSide = MAX_IMAGE_SIDE) => {
    const source = String(dataUrl || '');
    if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(source)) {
        throw new Error('不支持该图片格式，请使用 PNG、JPEG 或 WebP');
    }
    const image = await loadImage(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('图片尺寸无效');
    const scale = Math.min(1, maxSide / Math.max(width, height));
    if (scale >= 1 && source.length <= MAX_DATA_URL_LENGTH) return source;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
};

export const captureStageImage = async vm => {
    const snapshot = await requestStageSnapshot(vm);
    if (!snapshot) return null;
    try {
        return await prepareImageDataUrl(snapshot);
    } catch (error) {
        return snapshot;
    }
};

export const readImageFile = file => {
    if (!file || !/^image\/(?:png|jpeg|webp)$/i.test(file.type || '')) {
        return Promise.reject(new Error('请选择 PNG、JPEG 或 WebP 图片'));
    }
    if (file.size > MAX_SOURCE_BYTES) {
        return Promise.reject(new Error('图片过大，请选择 8MB 以内的图片'));
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            prepareImageDataUrl(String(reader.result || '')).then(resolve).catch(reject);
        };
        reader.onerror = () => reject(new Error('无法读取图片'));
        reader.readAsDataURL(file);
    });
};

export const getImageMime = dataUrl => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(String(dataUrl || ''));
    return match ? match[1].toLowerCase() : '';
};
