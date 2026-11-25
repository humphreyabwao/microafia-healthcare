// Saves to the in-memory Firebase fixture, never production.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
        const errors = [];
        const payloads = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**', route => route.abort());
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8') }));
        await page.route('**/patient-uploads.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

        async function fillForm(selector) {
            const form = page.locator(selector);
            for (const input of await form.locator('input:not([type="hidden"]), select, textarea').all()) {
                if (!(await input.isVisible()) || !(await input.isEnabled())) continue;
                const kind = await input.getAttribute('type');
                if (await input.getAttribute('name') === 'website') continue;
                const tag = await input.evaluate(el => el.tagName);
                if (kind === 'file' || kind === 'submit') continue;
                if (kind === 'checkbox') {
                    if (!(await input.isChecked())) {
                        const label = input.locator('xpath=ancestor::label[1]');
                        if (await label.count()) await label.click();
                        else await input.check();
                    }
                }
                else if (kind === 'radio') {
                    const name = await input.getAttribute('name');
                    if (!(await form.locator(`input[name="${name}"]:checked`).count())) await input.check({ force: true });
                } else if (tag === 'SELECT') {
                    const value = await input.locator('option').evaluateAll(options => options.find(option => option.value && !option.disabled)?.value);
                    if (value) await input.selectOption(value);
                } else if (kind === 'date') {
                    const value = await input.evaluate(el => {
                        let date = new Date((el.min || '2026-11-26') + 'T12:00:00');
                        if (date.getDay() === 0) date.setDate(date.getDate() + 1);
                        return date.toISOString().slice(0, 10);
                    });
                    await input.fill(value);
                } else await input.fill(kind === 'tel' ? '0700000000' : kind === 'email' ? 'test@example.com' : tag === 'TEXTAREA' ? 'Synthetic form test only. Please do not contact a real patient.' : 'Test Customer');
            }
            await form.locator('button[type="submit"]').click();
            await page.waitForFunction(() => savedOrders.length > 0);
            const saved = await page.evaluate(() => savedOrders[0]);
            payloads.push(saved);
            return saved;
        }

        for (const [route, form, collection] of [
            ['/book-appointment', '#appointmentForm', 'appointments'],
            ['/book-wellness?package=family', '#wellness-form', 'wellness_bookings'],
            ['/dna-services', '#dnaOrderForm', 'lab_orders'],
            ['/bloodline-apply', '#bloodlineForm', 'bloodline_applications'],
            ['/', '#contactForm', 'contact_messages']
        ]) {
            await page.goto('http://127.0.0.1:8000' + route);
            const saved = await fillForm(form);
            assert.equal(saved.collection, collection);
            assert.equal(saved.createdAt, 'server-time');
            console.log('PASS: ' + route + ' validates and saves the expected form payload');
        }
        await page.goto('http://127.0.0.1:8000/book-wellness?package=%22%5D%5B%22');
        assert(await page.locator('#wellness-form').isVisible());
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(os.tmpdir(), 'microafia-form-payloads.json'), JSON.stringify(payloads));
        console.log('PASS: malformed package query is harmless; no JavaScript errors in public form flows');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
