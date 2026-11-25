const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**', route => route.abort());
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8') }));
        await page.addInitScript(() => sessionStorage.setItem('mf_chat_v1', JSON.stringify({ malformed: true })));
        let online = false;
        await page.route('**/api/chat', route => online
            ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ reply: 'Please [book](/book-appointment). [unsafe](//evil.example) <img src=x onerror="alert(1)">' }) })
            : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
        await page.goto('http://127.0.0.1:8000/');
        await page.locator('.cb-launcher').click();
        const bounds = await page.locator('.cb-panel').boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= 320);
        await page.locator('.cb-input').fill('How do I book an appointment?');
        await page.locator('.cb-send').click();
        await page.waitForFunction(() => !document.querySelector('.cb-send').disabled);
        assert(await page.locator('.cb-body a[href="/book-appointment"]').count());
        online = true;
        await page.locator('.cb-input').fill('Thank you');
        await page.locator('.cb-send').click();
        await page.waitForFunction(() => !document.querySelector('.cb-send').disabled);
        assert.equal(await page.locator('.cb-body img').count(), 0);
        assert.equal(await page.locator('.cb-body a[href^="//"]').count(), 0);
        assert((await page.locator('.cb-bot').last().innerText()).includes('<img'));
        await page.keyboard.press('Escape');
        assert(await page.locator('.cb-panel').isHidden());
        assert.deepEqual(errors, []);
        console.log('PASS: chat fits 320px, malformed stored history recovers, offline FAQ and online replies work, unsafe links/HTML are inert');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
