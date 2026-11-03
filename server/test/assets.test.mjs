import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('all ZIP-derived art, dice controls and sound bytes are unchanged', () => {
  for (const [file, expected] of [
    ['board.png','08e015bbc81f2b01fb032253e110c75e67c10058a0e4764eb6f869ef33024f0b'],
    ['table.png','18a7f7e7239efb7e3abff23611c76c9e2977b49b714a5ed0e7229b0ca987518e'],
    ['back1.png','a5611e720b62ea56696e82b8e409b98717195d405a6528bbea9579b7d1afa26e'],
    ['back2.png','7d6c4711241419a5ee111a6991f5fe13151b458207a6936af37a7502c3761796'],
    ['back3.png','727a80a6a68bcba865df661a300a2f858ad1f21dfd8d7cf3c956b7627ec2e00b'],
    ['back4.png','5bd26072a1bbf10668c24dee5df465029549385494d5119427ce32f285d33866'],
    ['diceIcon.png','7267052328a7a4e5d8195c6c014711cb2a9872ab8e5cf98f03f330cf170ae852'],
    ['holdDiceIcon.png','395f70a33e47a027adedbc424487660f75edc8debef06c7d8713130a10d296e5'],
  ]) {
    const data = readFileSync(new URL(`../../web/table/src/images/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), expected);
  }
  for (const [file, expected] of [
    ['rollingDices.mp3','84ab65a913b640e0c2008e2c699e4b2d27936bf7df1b837bb3c2bc22c0ae9048'],
    ['shakeDices.mp3','56ed96f2a2e400a549e88ea9aa49c8008111786402eeaedd55f832c7c2e576d0'],
  ]) {
    const data = readFileSync(new URL(`../../web/table/src/sfx/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), expected);
  }
});
test('table modules have valid browser-module syntax', () => {
  for (const file of ['script.js','bridge.js','graphics-fallback.js']) {
    const source = readFileSync(new URL(`../../web/table/${file}`, import.meta.url),'utf8');
    // Explicit module mode catches the malformed optional chains present in the supplied archive.
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding:'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
