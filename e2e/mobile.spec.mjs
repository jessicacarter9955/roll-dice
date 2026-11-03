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
  // Verified 393x852 screenshot: practice CTA at x=41..352, y=385..425.
  for (let attempt = 0; attempt < 3 && await page.locator('iframe').count() === 0; attempt++) {
    await page.waitForTimeout(1200); // Let Flutter finish rasterizing the CTA.
    await page.mouse.click(196, 405);
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
  await page.waitForTimeout(300); // One compositing frame for the embedded WebGL canvas.
  await page.screenshot({path: 'visual-artifacts/flutter-practice-393x852.png'});
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
