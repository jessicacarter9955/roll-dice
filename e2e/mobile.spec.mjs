import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const prefix = process.env.E2E_SOURCE_TABLE === '1' ? '' : '/roll-dice';

test('three mobile breakpoints render the actual 3D ZIP table and controls', async ({page}) => {
  for (const [width, height] of [[320,700], [393,852], [430,932]]) {
    await page.setViewportSize({width, height});
    await page.goto(`${prefix}/table/index.html`);
    await expect(page.locator('#loading-overlay')).toBeHidden({timeout: 20000});
    await expect(page.locator('#loader')).toHaveCount(0);
    await expect(page.locator('#graphics-error')).toBeHidden();
    await expect(page.locator('canvas#c')).toBeVisible();
    const dimensions = await page.locator('#c').evaluate(canvas => ({w: canvas.getBoundingClientRect().width, h: canvas.getBoundingClientRect().height}));
    expect(dimensions.w).toBeGreaterThanOrEqual(width - 2);
    expect(dimensions.h).toBeGreaterThanOrEqual(height - 2);
    await expect(page.locator('.settingsMenu')).toBeVisible();
    await page.screenshot({path: `visual-artifacts/table-${width}x${height}.png`});
  }
  await page.locator('#changeArt').click();
  await expect(page.getByText('IMAGE: 2')).toBeVisible();
  await page.locator('#fastStart').click();
  await expect(page.getByText('SHAKE: OFF')).toBeVisible();
});

test('Flutter portrait lobby enters practice with the original renderer behind controls', async ({page}) => {
  test.skip(process.env.E2E_SOURCE_TABLE === '1', 'Source-table mode has no Flutter build.');
  await page.goto('/roll-dice/');
  await page.locator('flutter-view').waitFor({state: 'visible', timeout: 15000});
  // CanvasKit's accessibility activation sometimes hangs Chromium headless
  // even though the Flutter game is rendered. Exercise the actual touch target
  // instead of depending on a semantics overlay or its clickability.
  // The visible Regole button now sits directly above the practice CTA.
  // Portrait 393x852: practice CTA moves to about x=41..352, y=439..479.
  await page.waitForTimeout(1200);
  await page.screenshot({path: 'visual-artifacts/flutter-lobby-rules-393x852.png'});
  for (let attempt = 0; attempt < 3 && await page.locator('iframe').count() === 0; attempt++) {
    await page.waitForTimeout(1200); // Let Flutter finish rasterizing the CTA.
    await page.mouse.click(196, 459);
  }
  // The embedded real 3D table is the evidence of a successful transition;
  // no assertion below depends on Flutter's optional accessibility overlay.
  await expect(page.locator('iframe')).toHaveCount(1, {timeout: 15000});
  const table = page.frameLocator('iframe');
  await expect(table.locator('#loading-overlay')).toBeHidden({timeout: 20000});
  await expect(table.locator('#loader')).toHaveCount(0);
  await expect(table.locator('#graphics-error')).toBeHidden();
  // Do not capture the initial empty racks while the physical dice are still
  // tumbling: the original board should show the player's finished hand.
  await expect(table.locator('canvas#c')).toHaveAttribute('data-dice-ready', 'true', {timeout: 20000});
  // The five values seen tumbling must equal the five values in the player's
  // final rack; previously these were two unrelated random hands.
  await expect(table.locator('canvas#c')).toHaveAttribute('data-roll-consistent', 'true');
  await expect(table.locator('#rollLog')).toBeVisible();
  await expect(table.locator('#rollLogStatus')).toHaveText('Dadi fermi · mano privata');
  await expect(table.locator('#rollLogFaces span')).toHaveCount(5);
  await expect(table.locator('#rollLogCheck')).toContainText('coincidono');
  await page.waitForTimeout(300); // One compositing frame for the embedded WebGL canvas.
  await page.screenshot({path: 'visual-artifacts/flutter-practice-393x852.png'});
});

test('authoritative dice land on the exact five private values without a late correction', async ({page}) => {
  await page.goto(`${prefix}/table/index.html`);
  await expect(page.locator('#loading-overlay')).toBeHidden({timeout: 20000});
  await expect(page.locator('#graphics-error')).toBeHidden();
  // The self-hosted table accepts the same state event Flutter sends it. Keep
  // the hand fixed so a late visual correction cannot hide a random outcome.
  await page.evaluate(() => window.postMessage(JSON.stringify({
    type: 'state', round: 1, phase: 'bidding', practice: true,
    dice: [1, 2, 3, 4, 5], totalDice: 20,
    myTurn: true, busy: false, status: 'Il tuo turno',
  }), location.origin));
  await expect(page.locator('#rollLog')).toBeVisible();
  await expect(page.locator('#rollLogStatus')).toHaveText('Lancio sul tavolo in corso…', {timeout: 15000});
  await page.screenshot({path: 'visual-artifacts/authoritative-throw-393x852.png'});
  await expect(page.locator('#rollLogStatus')).toHaveText('Dadi fermi · mano privata', {timeout: 15000});
  await expect(page.locator('#rollLogFaces')).toContainText('D1: 1');
  await expect(page.locator('#rollLogFaces')).toContainText('D2: 2');
  await expect(page.locator('#rollLogFaces')).toContainText('D3: 3');
  await expect(page.locator('#rollLogFaces')).toContainText('D4: 4');
  await expect(page.locator('#rollLogFaces')).toContainText('D5: 5');
  await expect(page.locator('canvas#c')).toHaveAttribute('data-roll-consistent', 'true', {timeout: 10000});
  await page.screenshot({path: 'visual-artifacts/authoritative-settled-393x852.png'});
});

test('browser can record an actual 10-second table clip as a video file', async ({page}) => {
  await page.goto(`${prefix}/table/index.html`);
  await expect(page.locator('#loading-overlay')).toBeHidden({timeout: 20000});
  await expect(page.locator('#loader')).toHaveCount(0);
  await expect(page.locator('#graphics-error')).toBeHidden();
  const download = page.waitForEvent('download', {timeout: 18000});
  await page.evaluate(() => window.postMessage(JSON.stringify({type:'clip'}), location.origin));
  const received = await download;
  expect(received.suggestedFilename()).toMatch(/street-circle-table-\d+\.(webm|mp4)$/);
  await mkdir('visual-artifacts/videos', {recursive:true});
  await received.saveAs(`visual-artifacts/videos/${received.suggestedFilename()}`);
  await expect(page.locator('#shareHighlight')).toBeVisible();
});

test('browser without WebGL shows an explicit fallback rather than an infinite loader', async ({page}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).startsWith('webgl') || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto(`${prefix}/table/index.html`);
  await expect(page.locator('#graphics-error')).toBeVisible({timeout: 10000});
  await expect(page.locator('#loader')).toHaveCount(0);
  await expect(page.getByText('3D rendering is unavailable')).toBeVisible();
  await page.screenshot({path:'visual-artifacts/no-webgl-fallback.png'});
});
