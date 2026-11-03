import {defineConfig, devices} from '@playwright/test';

const sourceTableOnly = process.env.E2E_SOURCE_TABLE === '1';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  timeout: 45000,
  retries: 0,
  reporter: [['list'], ['html', {outputFolder: 'visual-artifacts/report', open: 'never'}]],
  outputDir: 'visual-artifacts/test-results',
  use: {
    ...devices['Desktop Chrome'],
    viewport: {width: 393, height: 852},
    baseURL: 'http://127.0.0.1:8777',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `python3 -m http.server 8777 --bind 127.0.0.1 --directory ${sourceTableOnly ? 'web' : 'preview'}`,
    cwd: '..',
    url: `http://127.0.0.1:8777/${sourceTableOnly ? '' : 'roll-dice/'}table/index.html`,
    reuseExistingServer: false,
    timeout: 15000,
  },
});
