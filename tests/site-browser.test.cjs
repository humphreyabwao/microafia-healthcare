const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**', route => route.abort());
        const iconCache = path.join(os.tmpdir(), 'microafia-fontawesome');
        if (fs.existsSync(path.join(iconCache, 'all.min.css'))) {
            let css = fs.readFileSync(path.join(iconCache, 'all.min.css'), 'utf8');
            for (const font of ['fa-solid-900', 'fa-brands-400', 'fa-regular-400']) css = css.replaceAll(`../webfonts/${font}.woff2`, 'data:font/woff2;base64,' + fs.readFileSync(path.join(iconCache, font + '.woff2')).toString('base64'));
            await page.route('**/font-awesome/6.4.2/css/all.min.css', route => route.fulfill({ contentType: 'text/css', body: css }));
        }
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8') }));
        await page.route('**/patient-uploads.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        const routes = ['/', '/lab-services', '/dna-services', '/book-appointment', '/book-wellness', '/imaging-services', '/pharmacy', '/bloodline-apply'];
        for (const width of [320, 375, 430, 767, 1024, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const route of routes) {
                const response = await page.goto('http://127.0.0.1:8000' + route);
                assert.equal(response.status(), 200);
                assert.equal(await page.locator('h1').count(), 1);
                const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
                assert(layout.document <= layout.viewport, `${route}: horizontal overflow at ${width}px (${layout.document})`);
                assert.equal(await page.locator('img:not([width]), img:not([height])').count(), 0, `${route}: unsized images`);
                if (width === 375 && ['/', '/bloodline-apply', '/pharmacy'].includes(route)) {
                    await page.screenshot({ path: path.join(os.tmpdir(), 'microafia-audit-' + (route === '/' ? 'home' : route.slice(1)) + '-mobile.png') });
                }
            }
            console.log(`PASS: all 8 public pages at ${width}px: successful response, no overflow, sized images`);
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('http://127.0.0.1:8000/');
        await page.locator('#doctors').scrollIntoViewIfNeeded();
        await page.locator('#doctors img').evaluate(image => image.decode());
        await page.locator('#doctors').screenshot({ path: path.join(os.tmpdir(), 'microafia-founder-final.png') });
        const founder = await page.locator('#doctors').evaluate(el => getComputedStyle(el).backgroundImage);
        assert(founder.includes('lab-team') && founder.includes('linear-gradient'));
        for (const resource of ['/.git/config', '/functions/index.js', '/tests/firebase.mock.js', '/storage.rules', '/firebase.json']) {
            assert.equal((await page.request.get('http://127.0.0.1:8000' + resource)).status(), 404, resource);
        }
        const headers = (await page.request.get('http://127.0.0.1:8000/admin/login')).headers();
        assert(headers['x-robots-tag'].includes('noindex'));
        assert.equal(headers['x-frame-options'], 'DENY');
        assert.equal(headers['x-content-type-options'], 'nosniff');
        assert.deepEqual(errors, []);
        console.log('PASS: founder lab background, protected development files, noindex/security headers and no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
