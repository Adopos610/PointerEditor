'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', 'scratch-gui', 'build');
const port = Number(process.env.PORT) || 4173;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
};

const server = http.createServer((req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    } catch (error) {
        res.writeHead(400);
        res.end('Bad request');
        return;
    }

    const relative = pathname === '/' ? 'editor.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (filePath !== root && !filePath.startsWith(rootWithSep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (error, stats) => {
        if (!error && stats.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                'Document-Isolation-Policy': 'isolate-and-credentialless'
            });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        const fallback = path.join(root, 'editor.html');
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Document-Isolation-Policy': 'isolate-and-credentialless'
        });
        fs.createReadStream(fallback).pipe(res);
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`PointerEditor web: http://127.0.0.1:${port}/editor.html`);
});
