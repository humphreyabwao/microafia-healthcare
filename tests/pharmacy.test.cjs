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
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8') }));
        for (const script of ['script.js', 'patient-uploads.js']) {
            await page.route(`**/${script}`, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        }
        await page.goto('http://127.0.0.1:8000/pharmacy');
        const openRequest = mode => page.locator(`[data-ph-request="${mode}"]`).click();
        const submit = page.locator('#phSubmit');
        const file = page.locator('#phRxFile');
        const waitUpload = text => page.waitForFunction(text => document.getElementById('phRxLabel').textContent.includes(text), text);
        const details = async () => {
            await page.locator('#phName').fill('Test Customer');
            await page.locator('#phPhone').fill('0700000000');
            await page.locator('#phAddress').fill('Test address');
        };
        const pdf = { name: 'prescription.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF test only') };
        const done = () => page.waitForSelector('[data-step="done"]', { state: 'visible' });

        assert.equal(await page.getByRole('link', { name: 'Consult a doctor', exact: true }).getAttribute('href'), '/book-appointment');
        await openRequest('delivery');
        await submit.click();
        assert.match(await page.locator('#phError').innerText(), /List the medicines/);
        await details();
        await page.locator('#phNotes').fill('Please confirm availability of the medicine on my request.');
        await page.evaluate(() => { window.orderMode = 'failure'; });
        await submit.click();
        await page.waitForFunction(() => document.getElementById('phError').textContent.includes("couldn't place"));
        assert.equal(await page.locator('#phName').inputValue(), 'Test Customer');
        await page.evaluate(() => { window.orderMode = 'success'; });
        await submit.click();
        await done();
        let saved = await page.evaluate(() => savedOrders.at(-1));
        assert.equal(saved.requestType, 'medicine_delivery');
        assert.equal(saved.items.length, 0);
        assert.equal(saved.pricingStatus, 'requires_review');
        assert(saved.notes);
        await page.locator('#phDoneBtn').click();
        console.log('PASS: standalone delivery request, failed submission retained and retry saved');

        await openRequest('prescription');
        await details();
        await submit.click();
        assert.match(await page.locator('#phError').innerText(), /List the medicines|upload your prescription/);
        await file.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
        assert.equal(await page.evaluate(() => putCount), 0);
        await file.setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
        assert.equal(await page.evaluate(() => putCount), 0);
        await page.evaluate(() => { window.uploadMode = 'slow'; });
        await file.setInputFiles(pdf);
        await waitUpload('50%');
        assert(await submit.isDisabled());
        await page.locator('#phRxRemove').click();
        await waitUpload('Choose file');
        await page.evaluate(() => { window.uploadMode = 'failure'; });
        await file.setInputFiles(pdf);
        await waitUpload('Upload failed');
        assert(await submit.isDisabled());
        await page.evaluate(() => { window.uploadMode = 'success'; });
        await page.locator('#phRxRetry').click();
        await waitUpload('attached');
        await submit.click();
        await done();
        saved = await page.evaluate(() => savedOrders.at(-1));
        assert.equal(saved.requestType, 'prescription_delivery');
        assert.equal(saved.prescription.name, 'prescription.pdf');
        assert(saved.prescription.path.startsWith('prescriptions/pharmacy/test-visitor/'));
        assert.equal(saved.prescription.ownerUid, 'test-visitor');
        assert.equal(saved.items.length, 0);
        await page.locator('#phDoneBtn').click();
        console.log('PASS: validation, progress, cancellation, upload retry and prescription-only delivery');

        await page.locator('[data-action="add"][data-id="rx"]').click();
        await page.locator('.ph-cart-btn').click();
        await page.locator('#phToCheckout').click();
        await details();
        await submit.click();
        assert.match(await page.locator('#phError').innerText(), /upload your prescription/);
        await page.locator('.ph-upload').evaluate(element => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(['png fixture'], '<unsafe>.png', { type: 'image/png' }));
            element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        });
        await waitUpload('attached');
        assert.equal(await page.locator('#phRxLabel img').count(), 0);
        await file.setInputFiles(pdf);
        await waitUpload('prescription.pdf attached');
        assert((await page.evaluate(() => deletedUploads.length)) >= 1);
        await submit.click();
        await done();
        saved = await page.evaluate(() => savedOrders.at(-1));
        assert.equal(saved.requestType, 'cart_delivery');
        assert.equal(saved.items[0].productId, 'rx');
        assert.equal(saved.subtotal, 200);
        assert.equal(saved.itemCount, 1);
        await page.locator('#phDoneBtn').click();
        console.log('PASS: Rx cart requires prescription, drop upload, safe filenames, replacement cleanup and cart reset');

        for (const width of [320, 375, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            for (const card of await page.locator('.ph-service-card').all()) {
                const bounds = await card.boundingBox();
                assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Card overflow at ${width}`);
            }
            await openRequest('delivery');
            await page.locator('#phDrawer').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
            const drawer = await page.locator('#phDrawer').boundingBox();
            assert(drawer.x >= -1 && drawer.x + drawer.width <= width + 1, `Drawer extends outside ${width}px viewport: ${JSON.stringify(drawer)}`);
            await page.locator('#phClose').click();
            await page.locator('#phDrawer').waitFor({ state: 'hidden' });
        }
        await page.setViewportSize({ width: 375, height: 900 });
        await page.locator('.ph-services').screenshot({ path: path.join(os.tmpdir(), 'microafia-pharmacy-mobile.png') });
        assert.deepEqual(errors, []);
        console.log('PASS: consultation URL, mobile cards/drawer at 320–1280 px and no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
