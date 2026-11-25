// Shared pharmacy stock rules - used by the pharmacy page, the homepage
// featured products and the admin, so they always agree.
//
// A product's status comes from:
//   - inStock === false          -> Out of stock (staff switched it off)
//   - stockQty (number, optional) compared with the shop's stock rules
//     (Firestore doc site_content/pharmacy, edited in Admin > Pharmacy > Products)
//   - no quantity entered        -> In stock (quantity not tracked)
(function () {
    'use strict';

    const DEFAULTS = { outOfStockBelow: 5, lowStockBelow: 10 };
    let rules = Object.assign({}, DEFAULTS);
    const listeners = [];

    function clean(raw) {
        const out = Number.isInteger(raw && raw.outOfStockBelow) ? raw.outOfStockBelow : DEFAULTS.outOfStockBelow;
        let low = Number.isInteger(raw && raw.lowStockBelow) ? raw.lowStockBelow : DEFAULTS.lowStockBelow;
        if (low < out) low = out;   // "low" can never sit below "out"
        return { outOfStockBelow: Math.max(0, out), lowStockBelow: low };
    }

    function quantity(p) {
        const q = p && p.stockQty;
        return typeof q === 'number' && Number.isFinite(q) ? Math.max(0, Math.floor(q)) : null;
    }

    // -> { state: 'in' | 'low' | 'out', label, qty, tracked }
    function status(p, r) {
        const use = r || rules;
        const qty = quantity(p);
        if (!p || p.inStock === false) return { state: 'out', label: 'Out of stock', qty, tracked: qty !== null };
        if (qty === null) return { state: 'in', label: 'In stock', qty, tracked: false };
        if (qty < use.outOfStockBelow) return { state: 'out', label: 'Out of stock', qty, tracked: true };
        if (qty < use.lowStockBelow) return { state: 'low', label: 'Low stock', qty, tracked: true };
        return { state: 'in', label: 'In stock', qty, tracked: true };
    }

    const available = (p, r) => status(p, r).state !== 'out';

    // Live rules: calls cb(rules) now and whenever staff change them
    function watch(cb) {
        listeners.push(cb);
        cb(rules);
        if (watch.started || typeof db === 'undefined' || !db) return;
        watch.started = true;
        db.collection('site_content').doc('pharmacy').onSnapshot(doc => {
            rules = clean(doc.exists ? doc.data() : null);
            listeners.forEach(fn => fn(rules));
        }, () => { /* keep defaults if the setting can't be read */ });
    }

    window.MicroafiaStock = { DEFAULTS, status, available, quantity, watch, clean, get rules() { return rules; } };
})();
