'use strict';

const fs = require('fs');
const path = require('path');

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

const sanitizeFileName = name => {
    const base = path.basename(String(name || '未命名作品'))
        .replace(INVALID_CHARS, '_')
        .replace(/\.sb[23]?$/i, '')
        .trim()
        .slice(0, 80);
    return base || '未命名作品';
};

const writeProjectsToDirectory = async (dir, items) => {
    const saved = [];
    const failed = [];
    const usedNames = new Set();
    for (const item of items) {
        const base = sanitizeFileName(item && item.name);
        let fileName = `${base}.sb3`;
        let counter = 2;
        while (usedNames.has(fileName.toLowerCase())) {
            fileName = `${base} (${counter++}).sb3`;
        }
        usedNames.add(fileName.toLowerCase());
        const bytes = typeof (item && item.dataBase64) === 'string'
            ? Buffer.from(item.dataBase64, 'base64')
            : Buffer.alloc(0);
        if (!bytes.length) {
            failed.push({name: fileName, error: '项目数据为空'});
            continue;
        }
        try {
            const target = path.join(dir, fileName);
            await fs.promises.writeFile(target, bytes);
            saved.push({name: fileName, path: target});
        } catch (error) {
            failed.push({name: fileName, error: error.message});
        }
    }
    return {saved, failed};
};

module.exports = {sanitizeFileName, writeProjectsToDirectory};
