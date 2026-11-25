// Run with a local dev server and playwright-core available on NODE_PATH.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const mockFirebase = require('node:fs').readFileSync(path.join(__dirname, 'firebase.mock.js'), 'utf8');

(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**', route => route.abort());
        await page.route('**/firebase-config.js', route => route.fulfill({
            contentType: 'application/javascript', body: mockFirebase
        }));
        await page.route('**/patient-uploads.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        await page.route('**/script.js', route => route.fulfill({
            contentType: 'application/javascript', body: ''
        }));
        await page.goto('http://127.0.0.1:8000/lab-services');
        const file = page.locator('#labRequestFile');
        const order = page.locator('#btnOrder');
        const status = page.locator('#labUploadStatus');
        const waitText = text => page.waitForFunction(text =>
            document.getElementById('labUploadStatus').textContent.includes(text), text);
        const pdf = { name: 'request.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test fixture') };
        const remove = () => status.getByRole('button', { name: 'Remove', exact: true }).click();
        assert(await order.isDisabled());

        await file.setInputFiles({ name: 'request.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
        await waitText('Choose a non-empty');
        assert.equal(await page.evaluate(() => putCount), 0);
        await file.setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
        await waitText('Choose a non-empty');
        assert.equal(await page.evaluate(() => putCount), 0);
        await file.setInputFiles({ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) });
        assert.equal(await page.evaluate(() => putCount), 0);
        console.log('PASS: invalid, oversized and empty files rejected before upload');

        await page.evaluate(() => { window.uploadMode = 'slow'; });
        await file.setInputFiles(pdf);
        await waitText('50%');
        assert(await order.isDisabled());
        await status.getByRole('button', { name: 'Cancel' }).click();
        assert(await status.isHidden());
        assert(await order.isDisabled());
        console.log('PASS: progress, blocked ordering during upload, cancellation');

        await page.evaluate(() => { window.uploadMode = 'failure'; });
        await file.setInputFiles(pdf);
        await waitText('could not accept');
        assert(await order.isDisabled());
        await page.evaluate(() => { window.uploadMode = 'success'; });
        await status.getByRole('button', { name: 'Retry' }).click();
        await waitText('attached.');
        assert(await order.isEnabled());
        await order.click();
        await page.waitForSelector('#orderForm', { state: 'visible' });
        assert.match(await page.locator('.modal-total').innerText(), /To be confirmed/);
        await page.locator('[name="fullName"]').fill('Test Customer');
        await page.locator('[name="phone"]').fill('0700000000');
        await page.evaluate(() => { window.orderMode = 'failure'; });
        await page.locator('.btn-submit-order').click();
        await page.waitForSelector('#messagePopup');
        assert.match(await page.locator('#messagePopup').innerText(), /Submission Failed/);
        assert.equal(await page.evaluate(() => savedOrders.length), 0);
        await page.locator('#messagePopup button').click();
        await page.evaluate(() => { window.orderMode = 'success'; });
        await page.locator('.btn-submit-order').click();
        await page.waitForSelector('#messagePopup');
        const saved = await page.evaluate(() => savedOrders[0]);
        assert.equal(saved.collection, 'lab_orders');
        assert.equal(saved.prescription.name, 'request.pdf');
        assert(saved.prescription.path.startsWith('prescriptions/'));
        assert.equal(saved.pricingStatus, 'requires_review');
        assert.equal(saved.tests.length, 0);
        assert(await status.isHidden());
        assert(await order.isDisabled());
        await page.locator('#messagePopup button').click();
        await page.waitForSelector('#orderForm', { state: 'detached' });
        console.log('PASS: upload retry, request-only order, failed submission preserved, successful order reset');

        await page.locator('.upload-box').evaluate(element => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(['png fixture'], '<img onerror=alert(1)>.png', { type: 'image/png' }));
            element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        });
        await waitText('attached.');
        assert.equal(await status.locator('img').count(), 0);
        await page.locator('.test-checkbox').first().check({ force: true });
        await order.click();
        await page.waitForSelector('#orderForm', { state: 'visible' });
        assert.equal(await page.locator('.order-prescription img').count(), 0);
        assert.match(await page.locator('.order-prescription').innerText(), /<img onerror/);
        await page.locator('.close-modal').click();
        await page.waitForSelector('#orderForm', { state: 'detached' });
        await file.setInputFiles(pdf);
        await waitText('request.pdf attached.');
        await remove();
        assert(await order.isEnabled()); // A selected test can be ordered without an attachment.
        assert((await page.evaluate(() => deletedUploads.length)) >= 2);
        console.log('PASS: drag-and-drop, safe filenames, replacement cleanup and removal');

        for (const width of [320, 375, 575, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            const image = page.locator('.dna-promo-image');
            await image.scrollIntoViewIfNeeded();
            assert(await image.evaluate(image => image.complete && image.naturalWidth > 0));
            const bounds = await page.locator('.dna-promo-banner').boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Banner overflow at ${width}`);
            for (const selector of ['.dna-promo-image', '.dna-promo-info', '.dna-promo-btn']) {
                const child = await page.locator(selector).boundingBox();
                assert(child.x >= bounds.x && child.x + child.width <= bounds.x + bounds.width + 1, `${selector} overflow at ${width}`);
            }
        }
        await page.setViewportSize({ width: 375, height: 900 });
        await page.locator('.dna-promo-banner').screenshot({ path: path.join(os.tmpdir(), 'microafia-lab-dna-mobile.png') });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('.dna-promo-banner').screenshot({ path: path.join(os.tmpdir(), 'microafia-lab-dna-desktop.png') });
        assert.deepEqual(errors, []);
        console.log('PASS: DNA image and responsive banner at 320, 375, 575, 768 and 1280 px; no JS errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
