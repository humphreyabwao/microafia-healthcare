// Run with a local dev server and playwright-core available on NODE_PATH.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mockFirebase = fs.readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**', route => route.abort());
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: mockFirebase }));
        await page.route('**/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        await page.goto('http://127.0.0.1:8000/book-appointment');

        const error = page.locator('#apError');
        const submit = page.locator('#apSubmit');
        const pick = text => page.locator('.ap-pill', { hasText: text }).first().click();
        const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        // 25 half-hour slots from 8:00 AM to 8:00 PM, grouped
        assert.equal(await page.locator('input[name="preferredTime"]').count(), 25);
        assert.deepEqual(await page.locator('.ap-times-group > .ap-group-title').allTextContents(), ['Morning', 'Afternoon', 'Evening']);

        // Validation order
        await submit.click();
        assert.match(await error.innerText(), /Choose the service/);
        await pick('Dental clinic');
        assert.equal(await page.locator('#apSumService').innerText(), 'Dental clinic');
        await submit.click();
        assert.match(await error.innerText(), /Choose a date/);

        // Today's past slots are disabled; a future day has every slot
        const today = isoDay(new Date());
        const min = await page.locator('#preferredDate').getAttribute('min');
        if (min === today) {
            await page.locator('#preferredDate').fill(today);
            const mins = new Date().getHours() * 60 + new Date().getMinutes() + 30;
            const disabled = await page.locator('input[name="preferredTime"]:disabled').count();
            const expected = Array.from({ length: 25 }, (_, i) => 480 + i * 30).filter(m => m < mins).length;
            assert.equal(disabled, expected);
        }
        const future = new Date(); future.setDate(future.getDate() + 3);
        await page.locator('#preferredDate').fill(isoDay(future));
        assert.equal(await page.locator('input[name="preferredTime"]:disabled').count(), 0);
        await submit.click();
        assert.match(await error.innerText(), /Choose a time/);
        await pick('10:30 AM');
        assert.equal(await page.locator('#apSumTime').innerText(), '10:30 AM');
        assert.match(await page.locator('#apSumDate').innerText(), new RegExp(String(future.getFullYear())));
        console.log('PASS: service pills, grouped time slots, past slots disabled, validation order, live summary');

        // Shortcut hint for services with their own page
        await pick('Ultrasound');
        assert.equal(await page.locator('#apShortcut a').getAttribute('href'), '/imaging-services');
        await pick('Dental clinic');
        assert(await page.locator('#apShortcut').isHidden());

        await page.locator('#firstName').fill('Test');
        await page.locator('#lastName').fill('Patient');
        await page.locator('#phone').fill('12');
        await submit.click();
        assert.match(await error.innerText(), /phone number/);
        await page.locator('#phone').fill('0700 000 000');
        await submit.click();
        assert.match(await error.innerText(), /tick the box/);
        await page.locator('label:has(#agreeTerms)').click();

        await page.evaluate(() => { window.orderMode = 'failure'; });
        await submit.click();
        await page.waitForFunction(() => document.getElementById('apError').textContent.includes("couldn't send"));
        assert.equal(await page.locator('#firstName').inputValue(), 'Test');
        await page.evaluate(() => { window.orderMode = 'success'; });
        await submit.click();
        await page.waitForSelector('#apDone', { state: 'visible' });
        const saved = await page.evaluate(() => savedOrders[0]);
        assert.equal(saved.collection, 'appointments');
        assert.equal(saved.service, 'dental');
        assert.equal(saved.serviceName, 'Dental clinic');
        assert.equal(saved.preferredDate, isoDay(future));
        assert.equal(saved.preferredTime, '10:30');
        assert.equal(saved.status, 'pending');
        const allowed = ['firstName','lastName','phone','email','dob','gender','service','serviceName',
            'preferredDate','preferredTime','symptoms','isNewPatient','createdAt','status','collection'];
        assert.deepEqual(Object.keys(saved).filter(k => !allowed.includes(k)), [], 'only fields allowed by firestore.rules');
        assert.match(await page.locator('#apDoneText').innerText(), /dental clinic .* at 10:30 AM/);
        await page.locator('#apAgain').click();
        assert.equal(await page.locator('#apSumService').innerText(), 'Not chosen yet');
        console.log('PASS: failed submit retained, saved payload matches rules, confirmation and reset');

        // Deep link + responsive
        await page.goto('http://127.0.0.1:8000/book-appointment?service=antenatal');
        assert.equal(await page.locator('#apSumService').innerText(), 'Antenatal care');
        for (const width of [320, 375, 768, 1024, 1280]) {
            await page.setViewportSize({ width, height: 860 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert(overflow <= 1, `Page overflows by ${overflow}px at ${width}`);
        }
        await page.setViewportSize({ width: 375, height: 760 });
        await page.locator('#apStep2').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => !document.getElementById('apBar').hidden);
        assert.deepEqual(errors, []);
        console.log('PASS: ?service= deep link, no overflow at 320–1280 px, phone summary bar, no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
