const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**', route => route.abort());
        const iconCache = path.join(os.tmpdir(), 'microafia-fontawesome');
        if (fs.existsSync(path.join(iconCache, 'all.min.css'))) {
            let iconCss = fs.readFileSync(path.join(iconCache, 'all.min.css'), 'utf8');
            for (const name of ['fa-solid-900', 'fa-brands-400', 'fa-regular-400']) {
                iconCss = iconCss.replaceAll(`../webfonts/${name}.woff2`, 'data:font/woff2;base64,' + fs.readFileSync(path.join(iconCache, name + '.woff2')).toString('base64'));
            }
            await page.route('**/font-awesome/6.4.2/css/all.min.css', route => route.fulfill({ contentType: 'text/css', body: iconCss }));
        }
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8') }));
        await page.route('**/patient-uploads.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        const toggle = page.locator('.menu-toggle');
        const menu = page.locator('.mobile-menu');
        const waitClosed = () => page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
        const routes = ['/', '/lab-services', '/dna-services', '/book-appointment', '/book-wellness', '/imaging-services', '/pharmacy'];

        for (const width of [320, 375, 430, 767, 991]) {
            await page.setViewportSize({ width, height: 800 });
            for (const route of routes) {
                await page.goto('http://127.0.0.1:8000' + route);
                assert(await page.locator('.upper-nav').isVisible(), `${route} hidden upper bar`);
                assert.equal(await page.locator('.upper-nav').evaluate(el => Math.round(el.getBoundingClientRect().height)), 40);
                assert.equal(await page.locator('.header').evaluate(el => Math.round(el.getBoundingClientRect().height)), 100);
                assert(await page.locator('.upper-nav .btn-signin').isVisible());
                assert(await page.locator('.mobile-nav .btn-signin').isHidden());
                assert(await page.locator('.upper-nav-email').isVisible());
                assert(await page.locator('.upper-nav-email-text').isHidden());
                assert.equal(await page.locator('.upper-nav-email').evaluate(el => getComputedStyle(el).borderLeftWidth), '1px');
                assert(await page.locator('.upper-nav-divider').isVisible());
                const right = await toggle.boundingBox();
                assert(right.x >= 0 && right.x + right.width <= width, `Toggle outside viewport ${route} at ${width}`);
                assert(await menu.evaluate(el => el.inert));
                await toggle.click();
                await menu.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
                assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
                assert(!(await menu.evaluate(el => el.inert)));
                const bounds = await menu.boundingBox();
                assert.equal(bounds.x, 0);
                assert.equal(bounds.width, width);
                assert.equal(bounds.y, 100, 'Menu is not attached to the lower tier');
                assert.equal(await menu.evaluate(el => getComputedStyle(el).borderRadius), '0px');
                assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
                await page.keyboard.press('Escape');
                await waitClosed();
                assert(await toggle.evaluate(el => el === document.activeElement));
                assert.equal(await page.evaluate(() => document.body.style.overflow), '');
                assert(await menu.evaluate(el => el.inert));
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${route} at ${width}`);
            }
            console.log(`PASS: all 7 pages at ${width}px: top tier, compact header, menu bounds, Escape, focus and scroll restore`);
        }

        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto('http://127.0.0.1:8000/');
        await toggle.click();
        const services = page.locator('.mobile-dropdown-toggle').first();
        const wellness = page.locator('.mobile-dropdown-toggle').nth(1);
        await services.click();
        assert.equal(await services.getAttribute('aria-expanded'), 'true');
        await wellness.click();
        assert.equal(await services.getAttribute('aria-expanded'), 'false');
        assert.equal(await wellness.getAttribute('aria-expanded'), 'true');
        await page.locator('.mobile-has-dropdown.active .mobile-dropdown-menu a').first().click();
        await waitClosed();
        await toggle.click();
        await page.locator('.mobile-menu-backdrop').click({ position: { x: 2, y: 650 } });
        await waitClosed();
        await toggle.click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await waitClosed();
        assert(await page.locator('.lower-nav').isVisible());
        assert(await menu.isHidden());
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        console.log('PASS: nested accordion, link closing, backdrop dismissal and desktop resize');

        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto('http://127.0.0.1:8000/');
        await page.evaluate(() => window.scrollTo(0, 500));
        await page.waitForFunction(() => document.querySelector('.header').getBoundingClientRect().height === 60);
        await page.locator('.upper-nav').waitFor({ state: 'hidden' });
        await toggle.click();
        await menu.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        assert.equal((await menu.boundingBox()).y, 60);
        assert.equal(await page.locator('.mobile-menu-backdrop').evaluate(el => el.getBoundingClientRect().top), 60);
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForFunction(() => document.querySelector('.header').getBoundingClientRect().height === 100);
        await toggle.click();
        await menu.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        await page.screenshot({ path: path.join(os.tmpdir(), 'microafia-mobile-navigation.png') });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.keyboard.press('Escape');
        await toggle.click();
        assert.equal(await menu.locator('.mobile-menu-list > li').first().evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.deepEqual(errors, []);
        console.log('PASS: top bar hides/restores on scroll, menu offsets follow the compact header, reduced motion and no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
