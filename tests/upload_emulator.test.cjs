// Uses real Firebase 13.4 compat SDKs and local Auth/Storage emulators.
// Firestore is stubbed; no test order is sent to a production service.
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
        page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
        page.on('console', message => { if (message.type() === 'error' && message.text().includes('upload failed')) console.error(message.text()); });
        await page.route('https://**', route => route.abort());
        await page.addInitScript({ content: ['app', 'auth', 'storage'].map(name => fs.readFileSync(
            path.join(process.env.FIREBASE_TEST_SDK || path.join(os.tmpdir(), 'microafia-firebase-sdk-13.4.0'), `firebase-${name}-compat.js`), 'utf8')).join('\n;\n') });
        await page.route('**/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: `
            const firebaseConfig = { apiKey: 'fake-key', projectId: 'demo-microafia',
                authDomain: 'demo-microafia.firebaseapp.com', storageBucket: 'demo-microafia.appspot.com' };
            firebase.initializeApp(firebaseConfig);
            window.savedOrders = [];
            const db = { collection: name => ({ where() { return this; },
                onSnapshot(cb) { cb({ docs: [] }); },
                async add(order) { window.savedOrders.push(order); return { id: 'emulator-test-order' }; }
            }) };
            // Only FieldValue is needed by the order payload; Firestore network is disabled.
            firebase.firestore = { FieldValue: { serverTimestamp: () => 'test-timestamp' } };
        ` }));
        await page.route('**/patient-uploads.js', route => route.fulfill({ contentType: 'application/javascript',
            body: fs.readFileSync(path.join(__dirname, '..', 'patient-uploads.js'), 'utf8') + `
                patientUploads.storage.useEmulator('127.0.0.1', ${Number(process.env.STORAGE_EMULATOR_PORT || 9199)});
                firebase.app('patient-uploads').auth().useEmulator('http://127.0.0.1:${Number(process.env.AUTH_EMULATOR_PORT || 9099)}', { disableWarnings: true });
            ` }));
        await page.route('**/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        const fixture = { name: 'emulator-test.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nTest fixture only. No patient data.\n%%EOF') };
        await page.goto('http://127.0.0.1:8000/lab-services');
        await page.locator('#labRequestFile').setInputFiles(fixture);
        await page.waitForFunction(() => {
            const status = document.getElementById('labUploadStatus');
            return status.textContent.includes('attached.') || status.classList.contains('is-error');
        }, null, { timeout: 15000 });
        assert.match(await page.locator('#labUploadStatus').innerText(), /attached\./);
        const labUid = await page.evaluate(() => firebase.app('patient-uploads').auth().currentUser.uid);
        assert(labUid);
        assert.equal(await page.evaluate(() => firebase.auth().currentUser), null);
        assert(await page.locator('#btnOrder').isEnabled());
        await page.locator('#btnOrder').click();
        await page.waitForSelector('#orderForm', { state: 'visible' });
        await page.locator('[name="fullName"]').fill('Emulator Test');
        await page.locator('[name="phone"]').fill('0700000000');
        await page.locator('.btn-submit-order').click();
        await page.waitForSelector('#messagePopup');
        const labOrder = await page.evaluate(() => savedOrders[0]);
        assert(labOrder.prescription.path.startsWith(`prescriptions/lab/${labUid}/`));
        assert(labOrder.prescription.url.includes('127.0.0.1:' + (process.env.STORAGE_EMULATOR_PORT || 9199)));
        console.log('PASS: actual anonymous session, real SDK lab upload, rules validation and order attachment');

        await page.goto('http://127.0.0.1:8000/pharmacy');
        await page.locator('[data-ph-request="prescription"]').click();
        await page.locator('#phRxFile').setInputFiles(fixture);
        await page.waitForFunction(() => document.getElementById('phRxLabel').textContent.includes('attached'));
        const pharmacyUid = await page.evaluate(() => firebase.app('patient-uploads').auth().currentUser.uid);
        assert.equal(pharmacyUid, labUid, 'Upload session survives navigation');
        assert.equal(await page.evaluate(() => firebase.auth().currentUser), null);
        await page.locator('#phName').fill('Emulator Test');
        await page.locator('#phPhone').fill('0700000000');
        await page.locator('#phAddress').fill('Emulator test address');
        await page.locator('#phSubmit').click();
        await page.waitForSelector('[data-step="done"]', { state: 'visible' });
        const pharmacyOrder = await page.evaluate(() => savedOrders[0]);
        assert(pharmacyOrder.prescription.path.startsWith(`prescriptions/pharmacy/${labUid}/`));
        assert.equal(pharmacyOrder.prescription.ownerUid, labUid);
        assert.equal(pharmacyOrder.requestType, 'prescription_delivery');
        assert.deepEqual(errors, []);
        await page.evaluate(async paths => {
            await Promise.all(paths.map(path => patientUploads.storage.ref(path).delete()));
        }, [labOrder.prescription.path, pharmacyOrder.prescription.path]);
        console.log('PASS: real SDK prescription delivery, persisted upload identity, staff login isolation and cleanup');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
