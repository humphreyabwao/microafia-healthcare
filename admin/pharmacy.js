// Pharmacy Module - Microafia Admin
// Products: `pharmacy_products`   Orders: `pharmacy_orders`
const PRODUCT_IMG_MAX = 3 * 1024 * 1024;

let phProducts = [];
let phOrders = [];
let orderFilter = 'all';
let orderSearch = '';
let productSearch = '';
let stockFilter = 'all';
const Stock = window.MicroafiaStock;
let pendingImage = null;      // File chosen in the product modal
let deleteTarget = null;      // { type: 'product' | 'order', id }

const ORDER_STATUSES = {
    pending: 'New',
    confirmed: 'Confirmed',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
};

// Escape anything that came from a customer or form before putting it in HTML
function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const ksh = n => 'KSh ' + Number(n || 0).toLocaleString('en-US');

// Admins can do everything; other roles follow their pharmacy permissions.
function canDo(action) {
    const user = typeof getCurrentUserData === 'function' ? getCurrentUserData() : null;
    if (!user || user.role === 'admin') return true;
    return hasPermission('pharmacy', action);
}
function denied() { showToast("You don't have permission to do that", 'error'); }

document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();

    // ---------- tabs ----------
    document.querySelectorAll('.ph-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ph-tab').forEach(t => t.classList.toggle('is-active', t === tab));
            document.querySelectorAll('.ph-panel').forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
        });
    });

    // ---------- live data ----------
    db.collection('pharmacy_products').onSnapshot(snap => {
        phProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        document.getElementById('productCount').textContent = phProducts.length;
        updateCategoryList();
        renderProducts();
        updateStockCount();
    }, err => {
        console.error('Error loading products:', err);
        document.getElementById('productsTableBody').innerHTML =
            '<tr><td colspan="7" class="loading-row"><i class="fas fa-exclamation-circle"></i> Error loading products</td></tr>';
    });

    db.collection('pharmacy_orders').orderBy('createdAt', 'desc').onSnapshot(snap => {
        phOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const count = s => phOrders.filter(o => (o.status || 'pending') === s).length;
        document.getElementById('pendingCount').textContent = count('pending');
        document.getElementById('deliveryCount').textContent = count('out_for_delivery');
        document.getElementById('deliveredCount').textContent = count('delivered');
        renderOrders();
    }, err => {
        console.error('Error loading orders:', err);
        document.getElementById('ordersTableBody').innerHTML =
            '<tr><td colspan="7" class="loading-row"><i class="fas fa-exclamation-circle"></i> Error loading orders</td></tr>';
    });

    // ---------- filters ----------
    document.getElementById('orderStatusFilter').addEventListener('change', e => { orderFilter = e.target.value; renderOrders(); });
    document.getElementById('orderSearch').addEventListener('input', e => { orderSearch = e.target.value.toLowerCase(); renderOrders(); });
    document.getElementById('productSearch').addEventListener('input', e => { productSearch = e.target.value.toLowerCase(); renderProducts(); });
    document.getElementById('stockFilter').addEventListener('change', e => { stockFilter = e.target.value; renderProducts(); });

    // ---------- stock rules (site_content/pharmacy) ----------
    const ruleOut = document.getElementById('ruleOut');
    const ruleLow = document.getElementById('ruleLow');
    const rulesMeta = document.getElementById('stockRulesMeta');
    let rulesDirty = false;
    [ruleOut, ruleLow].forEach(i => i.addEventListener('input', () => { rulesDirty = true; rulesMeta.textContent = ''; }));
    Stock.watch(rules => {
        if (!rulesDirty) { ruleOut.value = rules.outOfStockBelow; ruleLow.value = rules.lowStockBelow; }
        if (phProducts.length) renderProducts();
        updateStockCount();
        updateStockPreview();
    });
    db.collection('site_content').doc('pharmacy').onSnapshot(doc => {
        const d = doc.exists ? doc.data() : null;
        rulesMeta.textContent = d && d.updatedAt && d.updatedAt.toDate
            ? `Saved ${d.updatedAt.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${d.updatedBy ? ' by ' + d.updatedBy : ''}`
            : 'Using the defaults (out below 5, low below 10)';
    }, () => {});
    document.getElementById('stockRulesForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!canDo('edit')) return denied();
        const out = Number(ruleOut.value), low = Number(ruleLow.value);
        if (!Number.isInteger(out) || !Number.isInteger(low) || out < 0 || low < 0 || out > 10000 || low > 10000) {
            return showToast('Enter whole numbers between 0 and 10,000', 'error');
        }
        if (low < out) return showToast('"Low stock" must be the same as or higher than "out of stock"', 'error');
        const btn = document.getElementById('saveStockRules');
        btn.disabled = true;
        try {
            const user = typeof getCurrentUserData === 'function' ? getCurrentUserData() : null;
            await db.collection('site_content').doc('pharmacy').set({
                outOfStockBelow: out, lowStockBelow: low,
                updatedBy: String((user && (user.name || user.email)) || 'Staff').slice(0, 200),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            rulesDirty = false;
            showToast('Stock rules saved - the website updates straight away');
        } catch (err) {
            console.error('Saving stock rules failed:', err.code || err.message);
            showToast(err.code === 'permission-denied' ? "You don't have permission to change stock rules" : 'Could not save the stock rules', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // Quick quantity edits straight from the table
    document.getElementById('productsTableBody').addEventListener('change', e => {
        const input = e.target.closest('[data-stock-qty]');
        if (!input) return;
        if (!canDo('edit')) { renderProducts(); return denied(); }
        const raw = input.value.trim();
        const qty = raw === '' ? null : Number(raw);
        if (qty !== null && (!Number.isInteger(qty) || qty < 0 || qty > 100000)) {
            renderProducts();
            return showToast('Enter a whole number, or leave it blank to stop tracking', 'error');
        }
        db.collection('pharmacy_products').doc(input.dataset.stockQty).update({
            stockQty: qty === null ? firebase.firestore.FieldValue.delete() : qty,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => showToast(qty === null ? 'Stock no longer tracked for this product' : 'Stock updated'))
          .catch(err => { console.error(err); renderProducts(); showToast('Error updating stock', 'error'); });
    });
    document.getElementById('pStockQty').addEventListener('input', updateStockPreview);
    document.getElementById('pInStock').addEventListener('change', updateStockPreview);

    // ---------- product modal ----------
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('pImage').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > PRODUCT_IMG_MAX) {
            showToast('Choose a JPG, PNG, WebP or GIF photo up to 3 MB', 'error');
            e.target.value = '';
            return;
        }
        pendingImage = file;
        const reader = new FileReader();
        reader.onload = () => {
            document.getElementById('pImagePreview').innerHTML = `<img src="${reader.result}" alt="">`;
        };
        reader.readAsDataURL(file);
    });

    // Inline toggles + row actions (event delegation)
    document.getElementById('productsTableBody').addEventListener('change', e => {
        const toggle = e.target.closest('[data-toggle]');
        if (!toggle) return;
        if (!canDo('edit')) { toggle.checked = !toggle.checked; return denied(); }
        const field = toggle.dataset.toggle;
        if (field === 'featured' && toggle.checked && featuredCount(toggle.dataset.id) >= MAX_FEATURED) {
            toggle.checked = false;
            return showToast(`Only ${MAX_FEATURED} products can be featured. Un-feature one first.`, 'error');
        }
        const update = { [field]: toggle.checked, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (field === 'featured' && toggle.checked) update.featuredAt = firebase.firestore.FieldValue.serverTimestamp();
        db.collection('pharmacy_products').doc(toggle.dataset.id).update(update)
          .then(() => showToast(field === 'featured'
              ? (toggle.checked ? 'Now featured on the homepage' : 'Removed from homepage')
              : 'Product updated'))
          .catch(err => { console.error(err); toggle.checked = !toggle.checked; showToast('Error updating product', 'error'); });
    });

    document.getElementById('productsTableBody').addEventListener('click', e => {
        const btn = e.target.closest('[data-product-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.productAction === 'edit') openProductModal(id);
        if (btn.dataset.productAction === 'delete') {
            if (!canDo('delete')) return denied();
            const p = phProducts.find(x => x.id === id);
            deleteTarget = { type: 'product', id };
            document.getElementById('deleteMessage').textContent =
                `Delete "${p ? p.name : 'this product'}"? It will be removed from the website.`;
            openModal('deleteModal');
        }
    });

    document.getElementById('ordersTableBody').addEventListener('change', e => {
        const sel = e.target.closest('[data-order-status]');
        if (!sel) return;
        if (!canDo('edit')) return denied();
        db.collection('pharmacy_orders').doc(sel.dataset.id).update({
            status: sel.value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => showToast('Order status updated'))
          .catch(err => { console.error(err); showToast('Error updating status', 'error'); });
    });

    document.getElementById('ordersTableBody').addEventListener('click', e => {
        const btn = e.target.closest('[data-order-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.orderAction === 'view') viewOrder(id);
        if (btn.dataset.orderAction === 'delete') {
            if (!canDo('delete')) return denied();
            deleteTarget = { type: 'order', id };
            document.getElementById('deleteMessage').textContent = 'Delete this delivery order? This cannot be undone.';
            openModal('deleteModal');
        }
    });
});

// ---------- featured (homepage slideshow, max 5) ----------
const MAX_FEATURED = 5;
function featuredCount(exceptId) {
    return phProducts.filter(p => p.featured && p.id !== exceptId).length;
}

// ---------- rendering ----------
// Standard pharmacy sections. Categories already used by products are kept too.
const PH_CATEGORIES = [
    'Pain & Fever Relief', 'Antibiotics', 'Antimalarials', 'Antifungals', 'Dewormers & Antiparasitics',
    'Cough, Cold & Flu', 'Allergy & Antihistamines', 'Respiratory & Asthma', 'Digestive Health',
    'Diabetes Care', 'Blood Pressure & Heart', 'Cholesterol', 'Vitamins & Supplements',
    'Skin Care & Dermatology', 'Eye & Ear Care', 'Oral & Dental Care', "Women's Health", "Men's Health",
    'Family Planning & Sexual Health', 'Mother & Baby', 'Mental Health & Sleep', 'HIV & Chronic Care',
    'First Aid & Wound Care', 'Medical Devices & Diagnostics', 'Personal Care & Hygiene', 'Other'
];

function updateCategoryList(selected) {
    const select = document.getElementById('pCategory');
    const current = selected !== undefined ? selected : select.value;
    const used = phProducts.map(p => p.category).filter(Boolean);
    const extra = [...new Set(used.concat(current ? [current] : []))].filter(c => !PH_CATEGORIES.includes(c)).sort();
    select.innerHTML = '<option value="">Choose a category</option>' +
        PH_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') +
        (extra.length ? `<optgroup label="Already in use">${extra.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</optgroup>` : '');
    select.value = current || '';
}

function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    const list = phProducts.filter(p =>
        (!productSearch || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(productSearch)) &&
        (stockFilter === 'all' || Stock.status(p).state === stockFilter));
    const empty = !list.length;
    document.getElementById('productsEmpty').style.display = empty ? 'block' : 'none';
    document.getElementById('productsTableWrap').style.display = empty ? 'none' : 'block';
    if (empty) { tbody.innerHTML = ''; return; }

    tbody.innerHTML = list.map(p => `
        <tr>
            <td>
                <div class="ph-prod">
                    <div class="ph-thumb">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="">` : '<i class="fas fa-capsules"></i>'}</div>
                    <div class="ph-prod-text">
                        <span class="customer-name">${esc(p.name)}${p.requiresPrescription ? ' <span class="ph-rx-tag">Rx</span>' : ''}</span>
                        <span class="customer-email">${esc(p.description || '')}</span>
                    </div>
                </div>
            </td>
            <td>${esc(p.category || '-')}</td>
            <td><span class="total-price">${ksh(p.price)}</span></td>
            <td data-export="${esc(stockExport(p))}">${stockCell(p)}</td>
            <td><label class="ph-switch ph-switch--sm"><input type="checkbox" data-toggle="active" data-id="${p.id}" ${p.active !== false ? 'checked' : ''}><span></span></label></td>
            <td><label class="ph-switch ph-switch--sm ph-switch--star" title="Show in the homepage slideshow"><input type="checkbox" data-toggle="featured" data-id="${p.id}" ${p.featured ? 'checked' : ''}><span></span></label></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-view" data-product-action="edit" data-id="${p.id}" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn-action btn-delete" data-product-action="delete" data-id="${p.id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ---------- stock ----------
function stockCell(p) {
    const s = Stock.status(p);
    const qty = Stock.quantity(p);
    return `
        <div class="ph-stock-cell">
            <input type="number" class="ph-qty" min="0" max="100000" step="1" inputmode="numeric"
                   value="${qty === null ? '' : qty}" placeholder="&ndash;" data-stock-qty="${p.id}"
                   aria-label="Stock quantity for ${esc(p.name)}" title="Quantity in stock (blank = not tracked)">
            <span class="ph-stock-badge is-${s.state}">${s.label}${p.inStock === false ? ' (switched off)' : ''}</span>
        </div>`;
}

function stockExport(p) {
    const s = Stock.status(p);
    const qty = Stock.quantity(p);
    return `${s.label}${qty === null ? '' : ' (' + qty + ')'}`;
}

function updateStockCount() {
    const el = document.getElementById('lowStockCount');
    if (el) el.textContent = phProducts.filter(p => Stock.status(p).state !== 'in').length;
}

function formStockProduct() {
    const raw = document.getElementById('pStockQty').value.trim();
    return { inStock: document.getElementById('pInStock').checked, stockQty: raw === '' ? undefined : Number(raw) };
}

function updateStockPreview() {
    const el = document.getElementById('pStockPreview');
    if (!el) return;
    const s = Stock.status(formStockProduct());
    el.className = 'ph-stock-preview ph-stock-badge is-' + s.state;
    el.textContent = s.tracked || s.state === 'out' ? s.label : 'In stock (not tracked)';
}

function renderOrders() {
    const tbody = document.getElementById('ordersTableBody');
    const list = phOrders.filter(o => {
        if (orderFilter !== 'all' && (o.status || 'pending') !== orderFilter) return false;
        if (!orderSearch) return true;
        const hay = `${o.customerName} ${o.phone} ${o.email} ${o.deliveryAddress} ${(o.items || []).map(i => i.name).join(' ')}`;
        return hay.toLowerCase().includes(orderSearch);
    });
    const empty = !list.length;
    document.getElementById('ordersEmpty').style.display = empty ? 'block' : 'none';
    document.getElementById('ordersTableWrap').style.display = empty ? 'none' : 'block';
    if (empty) { tbody.innerHTML = ''; return; }

    tbody.innerHTML = list.map(o => {
        const status = o.status || 'pending';
        const items = o.items || [];
        const itemsHtml = items.slice(0, 2).map(i => `<span class="test-badge">${esc(i.qty)} &times; ${esc(i.name)}</span>`).join('') +
            (items.length > 2 ? `<span class="tests-more" data-order-action="view" data-id="${o.id}">+${items.length - 2} more</span>` : '');
        const when = o.createdAt && o.createdAt.toDate ? formatDate(o.createdAt.toDate()) : '';
        return `
            <tr class="${status === 'pending' ? 'ph-row-new' : ''}">
                <td>
                    <div class="customer-info">
                        <span class="customer-name">${esc(o.customerName || 'N/A')}</span>
                        <a class="customer-email" href="tel:${esc(o.phone)}">${esc(o.phone || '')}</a>
                        <span class="customer-email">${esc(when)}</span>
                    </div>
                </td>
                <td class="ph-address">${esc(o.deliveryAddress || '-')}${o.landmark ? `<small>${esc(o.landmark)}</small>` : ''}</td>
                <td data-export="${esc(items.map(i => `${i.qty || 1} × ${i.name}`).join(', '))}"><div class="tests-list">${itemsHtml || '<span class="no-prescription">See request details</span>'}</div></td>
                <td><span class="total-price">${o.pricingStatus === 'requires_review' ? 'To be confirmed' : ksh(o.subtotal)}</span></td>
                <td>${o.prescription && o.prescription.url
                    ? `<a href="${esc(o.prescription.url)}" target="_blank" rel="noopener" class="prescription-link"><i class="fas fa-file-medical"></i> View</a>`
                    : '<span class="no-prescription">-</span>'}</td>
                <td>
                    <select class="status-select" data-order-status data-id="${o.id}">
                        ${Object.entries(ORDER_STATUSES).map(([v, label]) =>
                            `<option value="${v}" ${v === status ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" data-order-action="view" data-id="${o.id}" title="View"><i class="fas fa-eye"></i></button>
                        <button class="btn-action btn-delete" data-order-action="delete" data-id="${o.id}" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function viewOrder(id) {
    const o = phOrders.find(x => x.id === id);
    if (!o) return;
    const items = (o.items || []).map(i => `
        <div class="test-item">
            <span class="test-item-name">${esc(i.qty)} &times; ${esc(i.name)}${i.requiresPrescription ? ' <span class="ph-rx-tag">Rx</span>' : ''}</span>
            <span class="test-item-price">${ksh(i.subtotal)}</span>
        </div>`).join('');
    const row = (label, value) => `
        <div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`;
    document.getElementById('viewModalBody').innerHTML =
        row('Request type', o.requestType === 'prescription_delivery' ? 'Prescription delivery' : o.requestType === 'medicine_delivery' ? 'Medicine delivery request' : 'Cart delivery') +
        row('Reference', esc(o.id.slice(0, 6).toUpperCase())) +
        row('Customer', esc(o.customerName || 'N/A')) +
        row('Phone', `<a href="tel:${esc(o.phone)}">${esc(o.phone || 'N/A')}</a>`) +
        row('Email', esc(o.email || '-')) +
        row('Delivery address', esc(o.deliveryAddress || '-')) +
        row('Landmark', esc(o.landmark || '-')) +
        row('Pays with', o.paymentPreference === 'cash' ? 'Cash' : 'M-Pesa') +
        `<div class="detail-row"><span class="detail-label">Items</span><div class="detail-value tests-detail">${items || '<span>See prescription and customer notes</span>'}</div></div>` +
        row('Items subtotal', `<span class="total-price">${o.pricingStatus === 'requires_review' ? 'To be confirmed' : ksh(o.subtotal)}</span> <small class="ph-hint">(delivery fee to be added on confirmation)</small>`) +
        row('Prescription', o.prescription && o.prescription.url
            ? `<a href="${esc(o.prescription.url)}" target="_blank" rel="noopener" class="prescription-link"><i class="fas fa-file-medical"></i> ${esc(o.prescription.name || 'View')}</a>`
            : 'None') +
        row('Customer notes', esc(o.notes || 'None')) +
        row('Status', `<span class="status-badge ${esc(o.status || 'pending')}">${ORDER_STATUSES[o.status || 'pending'] || esc(o.status)}</span>`) +
        row('Ordered', o.createdAt && o.createdAt.toDate ? formatDate(o.createdAt.toDate()) : 'N/A');
    openModal('viewModal');
}

// ---------- product create / edit ----------
function openProductModal(id) {
    if (!canDo(id ? 'edit' : 'edit')) return denied();
    const p = id ? phProducts.find(x => x.id === id) : null;
    pendingImage = null;
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = p ? p.id : '';
    document.getElementById('productModalTitle').innerHTML =
        `<i class="fas fa-pills"></i> ${p ? 'Edit Product' : 'Add Product'}`;
    document.getElementById('pName').value = p ? p.name || '' : '';
    updateCategoryList(p ? p.category || '' : '');
    document.getElementById('pPrice').value = p ? p.price : '';
    document.getElementById('pDescription').value = p ? p.description || '' : '';
    document.getElementById('pInStock').checked = p ? p.inStock !== false : true;
    document.getElementById('pStockQty').value = p && typeof p.stockQty === 'number' ? p.stockQty : '';
    updateStockPreview();
    document.getElementById('pActive').checked = p ? p.active !== false : true;
    document.getElementById('pRx').checked = p ? !!p.requiresPrescription : false;
    document.getElementById('pFeatured').checked = p ? !!p.featured : false;
    document.getElementById('pImagePreview').innerHTML = p && p.imageUrl
        ? `<img src="${esc(p.imageUrl)}" alt="">` : '<i class="fas fa-image"></i>';
    openModal('productModal');
    setTimeout(() => document.getElementById('pName').focus(), 50);
}

async function saveProduct() {
    if (!canDo('edit')) return denied();
    const id = document.getElementById('productId').value;
    const name = document.getElementById('pName').value.trim();
    const category = document.getElementById('pCategory').value.trim();
    const price = Number(document.getElementById('pPrice').value);

    const qtyRaw = document.getElementById('pStockQty').value.trim();
    const stockQty = qtyRaw === '' ? null : Number(qtyRaw);
    if (stockQty !== null && (!Number.isInteger(stockQty) || stockQty < 0 || stockQty > 100000)) {
        showToast('Stock quantity must be a whole number (or leave it blank)', 'error');
        return;
    }
    if (!name || !category || document.getElementById('pPrice').value === '' || !(price >= 0)) {
        showToast('Please fill in the name, choose a category and enter a valid price', 'error');
        return;
    }

    const btn = document.getElementById('saveProductBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const existing = id ? phProducts.find(x => x.id === id) : null;
    const featured = document.getElementById('pFeatured').checked;
    if (featured && !(existing && existing.featured) && featuredCount(id) >= MAX_FEATURED) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Product';
        showToast(`Only ${MAX_FEATURED} products can be featured. Un-feature one first.`, 'error');
        return;
    }
    const data = {
        name,
        category,
        price: Math.round(price),
        description: document.getElementById('pDescription').value.trim(),
        inStock: document.getElementById('pInStock').checked,
        ...(stockQty !== null ? { stockQty } : (id ? { stockQty: firebase.firestore.FieldValue.delete() } : {})),
        active: document.getElementById('pActive').checked,
        requiresPrescription: document.getElementById('pRx').checked,
        featured,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (featured && !(existing && existing.featured)) {
        data.featuredAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
        if (pendingImage) {
            const safe = pendingImage.name.replace(/[^\w.\-]/g, '_');
            const path = `pharmacy/products/${Date.now()}_${safe.toLowerCase()}`;
            const snap = await firebase.storage().ref(path).put(pendingImage);
            data.imageUrl = await snap.ref.getDownloadURL();
            data.imagePath = path;
            if (existing && existing.imagePath) {
                firebase.storage().ref(existing.imagePath).delete().catch(() => {});
            }
        }

        const col = firebase.firestore().collection('pharmacy_products');
        if (id) {
            await col.doc(id).update(data);
            showToast('Product updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await col.add(data);
            showToast('Product added to the pharmacy');
        }
        closeModal('productModal');
    } catch (err) {
        console.error('Error saving product:', err.code || err.message, err);
        const code = String(err.code || '');
        showToast(
            code === 'storage/unauthorized' ? 'Your account is not allowed to upload product photos. Ask an admin to give you Pharmacy edit access.'
            : code === 'permission-denied' ? 'Your account is not allowed to save products. Ask an admin to give you Pharmacy edit access.'
            : code.startsWith('storage/') ? 'The photo could not be uploaded. Try a smaller JPG or PNG (up to 3 MB), or save without a photo.'
            : 'Could not save the product. Check your connection and try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Product';
    }
}

// ---------- delete ----------
function confirmDelete() {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    const collection = type === 'product' ? 'pharmacy_products' : 'pharmacy_orders';
    const product = type === 'product' ? phProducts.find(x => x.id === id) : null;

    firebase.firestore().collection(collection).doc(id).delete()
        .then(() => {
            if (product && product.imagePath) {
                firebase.storage().ref(product.imagePath).delete().catch(() => {});
            }
            closeModal('deleteModal');
            showToast(type === 'product' ? 'Product deleted' : 'Order deleted');
        })
        .catch(err => {
            console.error('Delete failed:', err);
            showToast('Error deleting', 'error');
        })
        .finally(() => { deleteTarget = null; });
}

// ---------- shared helpers (same behaviour as other admin modules) ----------
function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = toast.querySelector('i');
    document.getElementById('toastMessage').textContent = message;
    toast.style.background = type === 'error' ? '#dc2626' : '#064e3b';
    icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});
