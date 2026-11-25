// Verify the candidate CDN compat SDK against real LOCAL Firestore rules.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage();
        await page.goto('http://127.0.0.1:8000/404.html');
        const folder = process.env.FIREBASE_TEST_SDK || path.join(os.tmpdir(), 'microafia-firebase-sdk-13.4.0');
        for (const service of ['app', 'auth', 'firestore', 'storage']) {
            await page.addScriptTag({ path: path.join(folder, `firebase-${service}-compat.js`) });
        }
        const payloads = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'microafia-form-payloads.json'), 'utf8'));
        const result = await page.evaluate(async payloads => {
            const app = firebase.initializeApp({ projectId: 'demo-microafia', apiKey: 'fake-key', storageBucket: 'demo-microafia.appspot.com' });
            const db = app.firestore();
            db.settings({ experimentalForceLongPolling: true });
            db.useEmulator('127.0.0.1', 8080);
            const saved = [];
            for (const payload of payloads) {
                const { collection, ...data } = payload;
                const ref = await db.collection(collection).add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                let denied = false;
                try { await ref.get(); } catch (error) { denied = error.code === 'permission-denied'; }
                if (!denied) throw new Error('Private request unexpectedly readable');
                saved.push(collection);
            }
            const products = await db.collection('pharmacy_products').where('active', '==', true).get();
            return { version: firebase.SDK_VERSION, saved, products: products.size };
        }, payloads);
        assert.equal(result.version, '13.4.0');
        assert.equal(result.saved.length, 5);
        assert(result.products > 0);
        console.log('PASS: Firebase compat ' + result.version + ': actual SDK saves all 5 form payloads, enforces patient privacy and reads the active catalogue');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
