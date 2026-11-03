import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('ZIP board and wood textures are unchanged', () => {
  for (const [file, expected] of [
    ['board.png','08e015bbc81f2b01fb032253e110c75e67c10058a0e4764eb6f869ef33024f0b'],
    ['table.png','18a7f7e7239efb7e3abff23611c76c9e2977b49b714a5ed0e7229b0ca987518e'],
  ]) {
    const data = readFileSync(new URL(`../../web/table/src/images/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), expected);
  }
});
test('table modules have valid browser-module syntax', () => {
  for (const file of ['script.js','bridge.js']) {
    const source = readFileSync(new URL(`../../web/table/${file}`, import.meta.url),'utf8');
    // Explicit module mode catches the malformed optional chains present in the supplied archive.
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding:'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
