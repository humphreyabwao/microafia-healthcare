
window.uploadMode = 'success'; window.orderMode = 'success';
window.savedOrders = []; window.deletedUploads = []; window.putCount = 0;
const firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
window.testProducts = [
    { id: 'otc', name: 'Test product', price: 100, active: true, inStock: true, category: 'Health' },
    { id: 'rx', name: 'Test Rx product', price: 200, active: true, inStock: true, requiresPrescription: true }
];
const db = { collection: name => ({
    doc() { return { onSnapshot(callback) { queueMicrotask(() => callback({ exists: false })); return () => {}; } }; },
    where() { return this; },
    onSnapshot(callback) {
        const docs = name === 'pharmacy_products' ? window.testProducts.map(p => ({ id: p.id, data: () => p })) : [];
        queueMicrotask(() => callback({ docs, size: docs.length, forEach: callback => docs.forEach(callback) }));
    },
    add: async data => {
    if (window.orderMode === 'failure') throw new Error('Submission unavailable');
    window.savedOrders.push({ collection: name, ...data }); return { id: 'test-order' };
} }) };
const storage = { setMaxUploadRetryTime() {}, ref: path => ({
    delete: async () => { window.deletedUploads.push(path); },
    put: () => {
        window.putCount++;
        let rejectTask; let timer;
        const task = new Promise((resolve, reject) => {
            rejectTask = reject;
            timer = setTimeout(() => {
                if (window.uploadMode === 'failure') reject({ code: 'storage/unauthorized' });
                else resolve({ ref: { getDownloadURL: async () => 'https://example.test/request.pdf' } });
            }, window.uploadMode === 'slow' ? 2000 : 80);
        });
        task.on = (_, progress) => progress({ bytesTransferred: 50, totalBytes: 100 });
        task.cancel = () => { clearTimeout(timer); rejectTask({ code: 'storage/canceled' }); };
        return task;
    }
}) };
const patientUploads = { storage, ensureUser: async () => ({ uid: 'test-visitor' }) };
