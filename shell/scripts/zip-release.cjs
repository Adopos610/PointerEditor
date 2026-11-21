'use strict';

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const shellRoot = path.resolve(__dirname, '..');
const version = process.env.POINTER_RELEASE_VERSION || require('../package.json').version;
const releaseDir = process.env.POINTER_RELEASE_DIR
    ? path.resolve(process.env.POINTER_RELEASE_DIR)
    : path.join(shellRoot, 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const webDir = path.resolve(shellRoot, '..', 'scratch-gui', 'build');
const tarExe = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
const powershellExe = path.join(
    process.env.SystemRoot || 'C:/Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
);

// GPL-3.0 要求随二进制分发许可证全文与源码获取方式，网页版静态包同样需要。
const legalFiles = [
    {from: path.join(shellRoot, 'build', 'LICENSE-GPL-3.0.txt'), to: 'LICENSE-GPL-3.0.txt'},
    {from: path.join(shellRoot, 'build', 'NOTICE.md'), to: 'NOTICE.md'},
    {from: path.join(shellRoot, 'build', 'LICENSE-SOURCE.txt'), to: 'LICENSE-SOURCE.txt'}
];

const installLegalFiles = targetDir => {
    if (!fs.existsSync(targetDir)) {
        throw new Error(`Missing folder: ${targetDir}`);
    }
    for (const file of legalFiles) {
        if (!fs.existsSync(file.from)) {
            throw new Error(`Missing legal file: ${file.from}`);
        }
        fs.copyFileSync(file.from, path.join(targetDir, file.to));
    }
};

const looksLikeZip = file => {
    if (!fs.existsSync(file)) {
        return false;
    }
    const fd = fs.openSync(file, 'r');
    try {
        const header = Buffer.alloc(4);
        fs.readSync(fd, header, 0, 4, 0);
        return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
    } finally {
        fs.closeSync(fd);
    }
};

const zipWithTar = (sourceDir, destination) => {
    // 必须显式指定 zip 格式：系统里的 GNU tar 会把 .zip 写成 tar 包。
    execFileSync(tarExe, ['--format', 'zip', '-cf', destination, '-C', sourceDir, '.'], {stdio: 'inherit'});
};

const zipWithPowershell = (sourceDir, destination) => {
    const escape = value => value.replace(/'/g, "''");
    const command = [
        '$ErrorActionPreference = "Stop";',
        `Compress-Archive -Path (Join-Path '${escape(sourceDir)}' '*')`,
        `-DestinationPath '${escape(destination)}' -CompressionLevel Optimal -Force`
    ].join(' ');
    execFileSync(powershellExe, ['-NoProfile', '-NonInteractive', '-Command', command], {stdio: 'inherit'});
};

const zipFolder = (sourceDir, destination) => {
    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Missing folder: ${sourceDir}`);
    }
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    if (fs.existsSync(destination)) {
        fs.rmSync(destination);
    }
    try {
        zipWithTar(sourceDir, destination);
    } catch (error) {
        console.warn(`tar 打包失败，改用 PowerShell：${error.message}`);
    }
    if (!looksLikeZip(destination)) {
        zipWithPowershell(sourceDir, destination);
    }
    if (!looksLikeZip(destination)) {
        throw new Error(`打包结果不是有效的 zip：${destination}`);
    }
    const size = (fs.statSync(destination).size / (1024 * 1024)).toFixed(1);
    console.log(`Created ${destination} (${size} MB)`);
};

const target = process.argv[2] || 'all';

if (target === 'all' || target === 'desktop') {
    installLegalFiles(unpackedDir);
    zipFolder(unpackedDir, path.join(releaseDir, `PointerEditor-${version}-win64.zip`));
}
if (target === 'all' || target === 'web') {
    installLegalFiles(webDir);
    zipFolder(webDir, path.join(releaseDir, `PointerEditor-${version}-web.zip`));
}
