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

const zipFolder = (sourceDir, destination) => {
    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Missing folder: ${sourceDir}`);
    }
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    if (fs.existsSync(destination)) {
        fs.rmSync(destination);
    }
    execFileSync(tarExe, ['-a', '-cf', destination, '-C', sourceDir, '.'], {stdio: 'inherit'});
    const size = (fs.statSync(destination).size / (1024 * 1024)).toFixed(1);
    console.log(`Created ${destination} (${size} MB)`);
};

const target = process.argv[2] || 'all';

if (target === 'all' || target === 'desktop') {
    zipFolder(unpackedDir, path.join(releaseDir, `PointerEditor-${version}-win64.zip`));
}
if (target === 'all' || target === 'web') {
    zipFolder(webDir, path.join(releaseDir, `PointerEditor-${version}-web.zip`));
}
