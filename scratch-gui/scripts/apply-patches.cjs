'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const patchesDir = path.join(root, 'patches');

const copyTree = (source, target) => {
    if (!fs.existsSync(source) || !fs.existsSync(target)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(to, {recursive: true});
            count += copyTree(from, to);
        } else if (entry.isFile()) {
            fs.mkdirSync(path.dirname(to), {recursive: true});
            fs.copyFileSync(from, to);
            count += 1;
        }
    }
    return count;
};

if (!fs.existsSync(patchesDir)) process.exit(0);
let total = 0;
for (const packageName of fs.readdirSync(patchesDir)) {
    const source = path.join(patchesDir, packageName);
    const target = path.join(root, 'node_modules', packageName, 'src');
    if (!fs.existsSync(source) || !fs.existsSync(target)) continue;
    total += copyTree(source, target);
}
if (total) console.log(`[PointerEditor] applied ${total} dependency patch file(s)`);
