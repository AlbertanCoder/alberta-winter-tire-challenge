'use strict';
const {defineConfig} = require('playwright/test');
module.exports = defineConfig({
  testDir: 'test/e2e',
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: 'list',
  projects: [
    {name: 'desktop', use: {browserName: 'chromium', headless: true, viewport: {width: 1280, height: 720}}},
    {name: 'phone', use: {browserName: 'chromium', headless: true, viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}},
  ],
});
