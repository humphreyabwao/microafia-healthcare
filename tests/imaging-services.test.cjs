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
        for (const script of ['script.js', 'patient-uploads.js']) {
            await page.route(`**/${script}`, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        }
        await page.goto('http://127.0.0.1:8000/imaging-services');

        const visible = () => page.locator('.im-scan:not([hidden])').count();
        const total = () => page.locator('#imTotal').innerText();
        const status = page.locator('#imUploadStatus');
        const waitStatus = text => page.waitForFunction(t => document.getElementById('imUploadStatus').textContent.includes(t), text);
        const submit = page.locator('#imSubmit');
        const error = page.locator('#imError');
        const pdf = { name: 'referral.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test fixture') };

        // Search + filter
        assert.equal(await visible(), 11);
        assert.equal(await page.locator('#imCount').innerText(), '11 scans');
        await page.locator('#imSearch').fill('pregnancy');
        assert.equal(await visible(), 1);
        assert.match(await page.locator('.im-scan:not([hidden]) .im-scan-name').innerText(), /Obstetric/);
        await page.locator('#imSearch').fill('kidney stones');
        assert.equal(await visible(), 1);
        await page.locator('#imSearch').fill('xyzzy');
        assert.equal(await visible(), 0);
        assert(await page.locator('#imEmpty').isVisible());
        await page.locator('#imSearchClear').click();
        await page.getByRole('button', { name: 'Doppler', exact: true }).click();
        assert.equal(await visible(), 2);
        await page.locator('#imSearch').fill('stroke');
        assert.equal(await visible(), 1);
        await page.locator('#imSearch').fill('');
        await page.getByRole('button', { name: 'All', exact: true }).click();
        assert.equal(await visible(), 11);
        console.log('PASS: search by name and keywords, category chips, empty state, clear');

        // Validation: nothing chosen
        await submit.click();
        assert.match(await error.innerText(), /at least one scan/);

        // Select + remove
        await page.getByRole('button', { name: 'Add Obstetric (ANC) scan' }).click();
        await page.getByRole('button', { name: 'Add Doppler scan (lower limb)' }).click();
        assert.equal(await total(), 'KSh 5,000');
        assert.equal(await page.locator('#imPicked li').count(), 2);
        await page.locator('#imPicked [data-remove="doppler-leg"]').click();
        assert.equal(await total(), 'KSh 1,500');
        assert.equal(await page.locator('.im-scan[data-id="doppler-leg"] .im-add').getAttribute('aria-pressed'), 'false');
        console.log('PASS: add, remove from panel, running total');

        // Upload: invalid, failure + retry, success
        const file = page.locator('#imFile');
        await file.setInputFiles({ name: 'bad.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
        await waitStatus('PDF, JPG or PNG');
        assert.equal(await page.evaluate(() => putCount), 0);
        await page.evaluate(() => { window.uploadMode = 'failure'; });
        await file.setInputFiles(pdf);
        await waitStatus('could not accept');
        await page.evaluate(() => { window.uploadMode = 'success'; });
        await status.getByRole('button', { name: 'Retry' }).click();
        await waitStatus('referral.pdf attached');
        assert.match(await page.locator('#imTotalNote').innerText(), /priced when we call/);
        console.log('PASS: upload validation, failure, retry and attach');

        // Mobile visit requires location
        await page.locator('[name="fullName"]').fill('Test Patient');
        await page.locator('[name="phone"]').fill('0700 000 000');
        await page.locator('input[name="visit"][value="mobile"]').check();
        assert(await page.locator('#imLocation').isVisible());
        await submit.click();
        assert.match(await error.innerText(), /mobile scan/);
        await page.locator('#imLocation').fill('Kilimani, near Yaya Centre');

        // Failed submission keeps everything; success saves the right record
        await page.evaluate(() => { window.orderMode = 'failure'; });
        await submit.click();
        await page.waitForFunction(() => document.getElementById('imError').textContent.includes("couldn't send"));
        assert.equal(await page.locator('[name="fullName"]').inputValue(), 'Test Patient');
        assert.equal(await page.evaluate(() => savedOrders.length), 0);
        await page.evaluate(() => { window.orderMode = 'success'; });
        await submit.click();
        await page.waitForSelector('#imDone', { state: 'visible' });
        const saved = await page.evaluate(() => savedOrders[0]);
        assert.equal(saved.collection, 'lab_orders');
        assert.equal(saved.category, 'imaging');
        assert.equal(saved.collectionMethod, 'mobile');
        assert.equal(saved.location, 'Kilimani, near Yaya Centre');
        assert.deepEqual(saved.tests, [{ name: 'Obstetric (ANC) scan', price: 1500 }]);
        assert.equal(saved.total, 1500);
        assert.equal(saved.pricingStatus, 'requires_review');
        assert.equal(saved.prescription.name, 'referral.pdf');
        assert(saved.prescription.path.startsWith('prescriptions/lab/test-visitor/'));
        const allowed = ['customerName','phone','email','notes','tests','total','prescription','pricingStatus','createdAt','status',
            'collectionMethod','location','consent','category','collection'];
        assert.deepEqual(Object.keys(saved).filter(k => !allowed.includes(k)), [], 'only fields allowed by firestore.rules');
        assert.equal(await page.evaluate(() => deletedUploads.length), 0, 'attached file kept for the order');
        await page.locator('#imAgain').click();
        assert.equal(await total(), 'KSh 0');
        assert(await status.isHidden());
        console.log('PASS: mobile location required, failed submit retained, saved record, reset');

        // Request-only (upload, no scans) at the clinic
        await file.setInputFiles(pdf);
        await waitStatus('attached');
        assert.equal(await total(), 'To be confirmed');
        await page.locator('[name="fullName"]').fill('Second Patient');
        await page.locator('[name="phone"]').fill('0711111111');
        await submit.click();
        await page.waitForSelector('#imDone', { state: 'visible' });
        const second = await page.evaluate(() => savedOrders[1]);
        assert.equal(second.tests.length, 0);
        assert.equal(second.collectionMethod, 'clinic');
        assert.equal(second.pricingStatus, 'requires_review');
        console.log('PASS: doctor\'s request without picked scans');

        // Deep link preselects a scan
        await page.goto('http://127.0.0.1:8000/imaging-services?scan=thyroid');
        assert.equal(await total(), 'KSh 2,000');

        // Responsive: no horizontal overflow, phone bar appears with a selection
        for (const width of [320, 375, 768, 1024, 1280]) {
            await page.setViewportSize({ width, height: 860 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert(overflow <= 1, `Page overflows by ${overflow}px at ${width}`);
            for (const sel of ['.im-scan', '.im-panel', '.im-toolbar']) {
                const box = await page.locator(sel).first().boundingBox();
                assert(box.x >= 0 && box.x + box.width <= width + 1, `${sel} overflow at ${width}`);
            }
        }
        await page.setViewportSize({ width: 375, height: 760 });
        await page.locator('#scans').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => !document.getElementById('imBar').hidden);
        assert(await page.locator('#imBar').isVisible());
        assert.deepEqual(errors, []);
        console.log('PASS: deep link, no overflow at 320–1280 px, phone summary bar, no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
