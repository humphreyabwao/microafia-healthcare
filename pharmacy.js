// Pharmacy shop - products from Firestore, cart in localStorage,
// delivery orders saved to the `pharmacy_orders` collection.
document.addEventListener('DOMContentLoaded', function () {
    const CART_KEY = 'microafia_pharmacy_cart';
    const MAX_FILE = 5 * 1024 * 1024;

    const grid = document.getElementById('phGrid');
    const chips = document.getElementById('phChips');
    const search = document.getElementById('phSearch');
    const statusEl = document.getElementById('phStatus');
    const cartbar = document.getElementById('phCartbar');
    const drawer = document.getElementById('phDrawer');
    const overlay = document.getElementById('phDrawerOverlay');
    const lines = document.getElementById('phLines');
    const toCheckout = document.getElementById('phToCheckout');
    const backBtn = document.getElementById('phBack');
    const title = document.getElementById('phDrawerTitle');
    const form = document.getElementById('phCheckout');
    const rxBox = document.getElementById('phRxBox');
    const rxFile = document.getElementById('phRxFile');
    const rxLabel = document.getElementById('phRxLabel');
    const errorEl = document.getElementById('phError');
    const submitBtn = document.getElementById('phSubmit');

    const rxDrop = document.querySelector('.ph-upload');
    const rxRetry = document.getElementById('phRxRetry');
    const rxRemove = document.getElementById('phRxRemove');
    let requestMode = 'cart';
    let isUploading = false;
    let isSubmitting = false;
    let failedFile = null;
    let uploadTask = null;
    let uploadVersion = 0;
    let products = [];
    let addHandled = false;
    let category = 'all';
    let query = '';
    let cart = loadCart();          // { productId: qty }
    let prescription = null;        // { name, url, path }

    // ---------- helpers ----------
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ksh = n => 'KSh ' + Number(n || 0).toLocaleString('en-US');
    const Stock = window.MicroafiaStock;
    const stockOf = p => Stock.status(p);
    const canBuy = p => Stock.available(p);
    const stockBadge = p => { const s = stockOf(p); return `<span class="ph-stock ph-stock--${s.state}">${s.label}</span>`; };

    function loadCart() {
        try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveCart() {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ }
    }
    function byId(id) { return products.find(p => p.id === id); }

    // Only items that still exist and are in stock count towards the order
    function cartItems() {
        return Object.keys(cart)
            .map(id => ({ p: byId(id), qty: cart[id] }))
            .filter(i => i.p && canBuy(i.p) && i.qty > 0);
    }
    const cartCount = () => cartItems().reduce((n, i) => n + i.qty, 0);
    const cartTotal = () => cartItems().reduce((n, i) => n + i.qty * Number(i.p.price || 0), 0);
    const needsRx = () => cartItems().some(i => i.p.requiresPrescription);

    // "Request delivery" links from the homepage arrive as /pharmacy?add=<productId>.
    // Add that product once, open the cart, then tidy the URL.
    function addFromLink() {
        if (addHandled) return;
        addHandled = true;
        const params = new URLSearchParams(window.location.search);
        const id = params.get('add');
        if (!id) return;
        params.delete('add');
        const rest = params.toString();
        history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
        const p = byId(id);
        if (!p || !canBuy(p)) return;
        if (!cart[id]) changeQty(id, 1);
        openDrawer();
    }

    // ---------- catalogue ----------
    function renderChips() {
        const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
        if (category !== 'all' && !cats.includes(category)) category = 'all';
        chips.innerHTML = ['all', ...cats].map(c => `
            <button class="ph-chip${c === category ? ' is-active' : ''}" data-category="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>
        `).join('');
    }

    function controlHtml(p) {
        if (!canBuy(p)) return '<span class="ph-soldout">Out of stock</span>';
        const qty = cart[p.id] || 0;
        if (!qty) return `<button class="ph-add" data-action="add" data-id="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart"><i class="fas fa-plus" aria-hidden="true"></i><span>Add</span></button>`;
        return `
            <div class="ph-stepper" role="group" aria-label="Quantity of ${esc(p.name)}">
                <button data-action="dec" data-id="${p.id}" aria-label="Remove one"><i class="fas fa-minus"></i></button>
                <span>${qty}</span>
                <button data-action="inc" data-id="${p.id}" aria-label="Add one"><i class="fas fa-plus"></i></button>
            </div>`;
    }

    function renderGrid() {
        const q = query.trim().toLowerCase();
        const list = products.filter(p =>
            (category === 'all' || p.category === category) &&
            (!q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)));

        if (!products.length) {
            statusEl.hidden = false;
            statusEl.innerHTML = '<i class="fas fa-box-open"></i> Our online pharmacy is being stocked. Call or WhatsApp us to order in the meantime.';
        } else if (!list.length) {
            statusEl.hidden = false;
            statusEl.innerHTML = '<i class="fas fa-search"></i> No products match your search.';
        } else {
            statusEl.hidden = true;
        }

        grid.innerHTML = list.map(cardHtml).join('');
    }

    const productUrl = id => `${window.location.pathname}?product=${encodeURIComponent(id)}`;

    function cardHtml(p) {
        return `
            <article class="ph-card${canBuy(p) ? '' : ' is-oos'}">
                <div class="ph-card-img">
                    ${p.imageUrl
                        ? `<img src="${esc(p.imageUrl)}" alt="" width="400" height="400" loading="lazy" decoding="async">`
                        : '<i class="fas fa-capsules" aria-hidden="true"></i>'}
                    ${p.requiresPrescription ? '<span class="ph-rx" title="Prescription required">Rx</span>' : ''}
                </div>
                <div class="ph-card-body">
                    <div class="ph-card-meta">
                        ${p.category ? `<span class="ph-cat">${esc(p.category)}</span>` : ''}
                        ${stockBadge(p)}
                    </div>
                    <h3 class="ph-card-name"><a class="ph-card-link" href="${productUrl(p.id)}" data-product="${esc(p.id)}">${esc(p.name)}</a></h3>
                    <div class="ph-card-foot">
                        <span class="ph-price">${ksh(p.price)}</span>
                        <span class="ph-card-control" data-control="${esc(p.id)}">${controlHtml(p)}</span>
                    </div>
                </div>
            </article>`;
    }

    function refreshControl(id) {
        const p = byId(id);
        if (!p) return;
        document.querySelectorAll(`[data-control="${id}"]`).forEach(slot => { slot.innerHTML = controlHtml(p); });
        const big = detail.querySelector(`[data-detail-control="${id}"]`);
        if (big) big.innerHTML = detailControlHtml(p);
    }

    // ---------- product page (/pharmacy?product=<id>) ----------
    const detail = document.getElementById('phDetail');
    const shop = document.getElementById('phShop');
    const baseTitle = document.title;
    let lastScroll = 0;

    function detailControlHtml(p) {
        if (!canBuy(p)) {
            return `<span class="ph-unavailable">Out of stock</span>
                <a class="ph-detail-alt" href="https://wa.me/254740250696?text=${encodeURIComponent('Hello, when will ' + p.name + ' be back in stock?')}" target="_blank" rel="noopener">Ask when it's back</a>`;
        }
        const qty = cart[p.id] || 0;
        if (!qty) return `<button type="button" class="ph-detail-add" data-action="add" data-id="${p.id}">Add to cart</button>`;
        return `
            <div class="ph-stepper ph-stepper--lg" aria-label="Quantity">
                <button data-action="dec" data-id="${p.id}" aria-label="Remove one"><i class="fas fa-minus"></i></button>
                <span>${qty}</span>
                <button data-action="inc" data-id="${p.id}" aria-label="Add one"><i class="fas fa-plus"></i></button>
            </div>
            <button type="button" class="ph-detail-checkout" data-open-cart>View cart &middot; <span data-cart-count>${cartCount()}</span></button>`;
    }

    function renderDetail(p) {
        if (!p) {
            detail.innerHTML = `
                <a class="ph-detail-back" href="${window.location.pathname}" data-back>&larr; All products</a>
                <div class="ph-detail-missing">
                    <h1>This product isn't available any more</h1>
                    <p>It may have been removed from the shop. Browse the pharmacy or WhatsApp our pharmacist and we'll help you find an alternative.</p>
                    <a class="ph-detail-add" href="${window.location.pathname}" data-back>Browse the pharmacy</a>
                </div>`;
            document.title = 'Product not found - ' + baseTitle;
            return;
        }
        const related = products.filter(x => x.id !== p.id && x.category && x.category === p.category).slice(0, 4);
        const fill = related.length < 4
            ? products.filter(x => x.id !== p.id && !related.includes(x)).slice(0, 4 - related.length) : [];
        const more = related.concat(fill);
        detail.innerHTML = `
            <nav class="ph-detail-crumbs" aria-label="Breadcrumb">
                <a href="${window.location.pathname}" data-back>&larr; All products</a>
                ${p.category ? `<span aria-hidden="true">/</span><a href="${window.location.pathname}" data-back data-category="${esc(p.category)}">${esc(p.category)}</a>` : ''}
            </nav>
            <article class="ph-detail-main">
                <div class="ph-detail-media">
                    ${p.imageUrl
                        ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}">`
                        : '<i class="fas fa-capsules" aria-hidden="true"></i>'}
                    ${p.requiresPrescription ? '<span class="ph-rx" title="Prescription required">Rx</span>' : ''}
                </div>
                <div class="ph-detail-info">
                    ${p.category ? `<span class="ph-cat">${esc(p.category)}</span>` : ''}
                    <h1 class="ph-detail-name">${esc(p.name)}</h1>
                    <p class="ph-detail-price">${ksh(p.price)}</p>
                    <p class="ph-detail-stock is-${stockOf(p).state}">
                        <span aria-hidden="true"></span>${stockOf(p).state === 'low' ? 'Low stock &mdash; order soon' : stockOf(p).label}
                    </p>
                    ${p.description ? `<p class="ph-detail-desc">${esc(p.description)}</p>` : ''}
                    ${p.requiresPrescription ? `
                        <p class="ph-detail-rx"><strong>Prescription required.</strong> Add it to your cart and upload your prescription at checkout &mdash; our pharmacist checks it before dispatch.</p>` : ''}
                    <div class="ph-detail-actions" data-detail-control="${p.id}">${detailControlHtml(p)}</div>
                    <ul class="ph-detail-promises">
                        <li><i class="fas fa-shield-halved" aria-hidden="true"></i> Genuine, quality-assured medicine</li>
                        <li><i class="fas fa-phone" aria-hidden="true"></i> We call to confirm before anything is sent</li>
                        <li><i class="fas fa-truck" aria-hidden="true"></i> Delivered to your door</li>
                    </ul>
                    <p class="ph-detail-help">Questions about this product? <a href="https://wa.me/254740250696?text=${encodeURIComponent('Hello, I have a question about ' + p.name)}" target="_blank" rel="noopener">Ask our pharmacist on WhatsApp</a></p>
                </div>
            </article>
            ${more.length ? `
                <section class="ph-detail-more" aria-label="More products">
                    <h2>${related.length ? 'More in ' + esc(p.category) : 'You may also need'}</h2>
                    <div class="ph-grid">${more.map(cardHtml).join('')}</div>
                </section>` : ''}`;
        document.title = `${p.name} - ${baseTitle}`;
    }

    function showDetail(id, { push = true } = {}) {
        if (push) {
            if (shop.classList.contains('is-detail')) history.pushState({ product: id }, '', productUrl(id));
            else { lastScroll = window.scrollY; history.pushState({ product: id }, '', productUrl(id)); }
        }
        renderDetail(byId(id));
        detail.hidden = false;
        shop.classList.add('is-detail');
        const top = shop.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 80) - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        const heading = detail.querySelector('h1');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }

    function hideDetail({ push = true, restore = true } = {}) {
        if (!shop.classList.contains('is-detail')) return;
        if (push) history.pushState({}, '', window.location.pathname);
        shop.classList.remove('is-detail');
        detail.hidden = true;
        detail.innerHTML = '';
        document.title = baseTitle;
        if (restore) window.scrollTo({ top: lastScroll, behavior: 'auto' });
    }

    function route() {
        const id = new URLSearchParams(window.location.search).get('product');
        if (id) showDetail(id, { push: false });
        else hideDetail({ push: false });
    }

    window.addEventListener('popstate', route);

    // Open a product from any card (grid or "more" row); keep Add/quantity buttons separate
    document.addEventListener('click', e => {
        const link = e.target.closest('.ph-card-link');
        if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
            e.preventDefault();
            showDetail(link.dataset.product);
            return;
        }
        const card = e.target.closest('.ph-card');
        if (card && !e.target.closest('[data-action], a, button, .ph-stepper')) {
            const l = card.querySelector('.ph-card-link');
            if (l) showDetail(l.dataset.product);
        }
    });

    detail.addEventListener('click', e => {
        const back = e.target.closest('[data-back]');
        if (back) {
            e.preventDefault();
            if (back.dataset.category) {
                category = back.dataset.category;
                renderChips(); renderGrid();
            }
            hideDetail();
            return;
        }
        if (e.target.closest('[data-open-cart]')) { openDrawer(); return; }
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'add' || btn.dataset.action === 'inc') changeQty(btn.dataset.id, 1);
        if (btn.dataset.action === 'dec') changeQty(btn.dataset.id, -1);
    });

    function changeQty(id, delta) {
        const next = (cart[id] || 0) + delta;
        if (next <= 0) delete cart[id]; else cart[id] = Math.min(next, 99);
        saveCart();
        refreshControl(id);
        renderCart();
    }

    grid.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === 'add' || btn.dataset.action === 'inc') changeQty(id, 1);
        if (btn.dataset.action === 'dec') changeQty(id, -1);
    });

    chips.addEventListener('click', e => {
        const chip = e.target.closest('.ph-chip');
        if (!chip) return;
        category = chip.dataset.category;
        chips.querySelectorAll('.ph-chip').forEach(c => c.classList.toggle('is-active', c === chip));
        renderGrid();
    });

    search.addEventListener('input', () => { query = search.value; renderGrid(); });

    // ---------- cart drawer ----------
    function renderCart() {
        const items = cartItems();
        const count = cartCount();
        document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = count; });
        document.querySelectorAll('[data-cart-total]').forEach(el => { el.textContent = ksh(cartTotal()); });
        cartbar.hidden = count === 0;
        toCheckout.disabled = count === 0;
        rxBox.hidden = false;
        document.getElementById('phRxTitle').textContent = needsRx() || requestMode === 'prescription'
            ? 'Prescription required' : 'Prescription (optional)';
        if (requestMode !== 'cart' && !items.length) {
            form.querySelector('[data-cart-total]').textContent = 'To be confirmed';
        }

        lines.innerHTML = items.length ? items.map(({ p, qty }) => `
            <div class="ph-line">
                <div class="ph-line-img">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="">` : '<i class="fas fa-capsules"></i>'}</div>
                <div class="ph-line-info">
                    <strong>${esc(p.name)}</strong>
                    <span>${ksh(p.price)}${p.requiresPrescription ? ' &middot; <em>Rx</em>' : ''}</span>
                    <div class="ph-stepper ph-stepper--sm">
                        <button data-line="dec" data-id="${p.id}" aria-label="Remove one"><i class="fas fa-minus"></i></button>
                        <span>${qty}</span>
                        <button data-line="inc" data-id="${p.id}" aria-label="Add one"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
                <div class="ph-line-end">
                    <strong>${ksh(qty * Number(p.price || 0))}</strong>
                    <button class="ph-remove" data-line="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `).join('') : `
            <div class="ph-empty">
                <i class="fas fa-basket-shopping"></i>
                <p>Your cart is empty.</p>
            </div>`;

        // If the cart empties while on the checkout step, go back
        if (!items.length && !form.hidden && requestMode === 'cart') showStep('cart');
    }

    lines.addEventListener('click', e => {
        const btn = e.target.closest('[data-line]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.line === 'inc') changeQty(id, 1);
        if (btn.dataset.line === 'dec') changeQty(id, -1);
        if (btn.dataset.line === 'remove') changeQty(id, -(cart[id] || 0));
    });

    function showStep(step) {
        drawer.querySelectorAll('.ph-step').forEach(s => { s.hidden = s.dataset.step !== step; });
        backBtn.hidden = step !== 'checkout';
        title.textContent = step === 'checkout' ? (requestMode === 'prescription' ? 'Send your prescription' : 'Delivery details') : step === 'done' ? 'Thank you' : 'Your cart';
    }

    function openDrawer() {
        if (isSubmitting) return;
        requestMode = 'cart';
        renderCart();
        showStep('cart');
        overlay.hidden = false;
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('phClose').focus(), 50);
    }

    function closeDrawer() {
        if (isSubmitting) return;
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;
        document.body.style.overflow = '';
    }

    document.querySelectorAll('[data-open-cart]').forEach(b => b.addEventListener('click', openDrawer));
    document.getElementById('phClose').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer(); });
    toCheckout.addEventListener('click', () => { if (cartItems().length) showStep('checkout'); });
    backBtn.addEventListener('click', () => { if (!isSubmitting) { requestMode = 'cart'; renderCart(); showStep('cart'); } });
    document.getElementById('phDoneBtn').addEventListener('click', closeDrawer);

    document.querySelectorAll('[data-ph-request]').forEach(button => {
        button.addEventListener('click', () => {
            if (isSubmitting) return;
            openDrawer();
            requestMode = button.dataset.phRequest;
            showStep('checkout');
            renderCart();
            showError('');
            setTimeout(() => {
                if (requestMode === 'prescription') rxDrop.focus();
                else document.getElementById('phName').focus();
            }, 60);
        });
    });

    // ---------- prescription upload ----------
    function updateUploadControls() {
        rxFile.disabled = isUploading || isSubmitting;
        rxDrop.setAttribute('aria-disabled', String(isUploading || isSubmitting));
        rxRetry.hidden = !failedFile || isUploading;
        rxRetry.disabled = isSubmitting;
        rxRemove.hidden = !isUploading && !prescription && !failedFile;
        rxRemove.textContent = isUploading ? 'Cancel upload' : 'Remove';
        rxRemove.disabled = isSubmitting;
        submitBtn.disabled = isUploading || isSubmitting || Boolean(failedFile);
    }

    async function deletePrescription(file) {
        if (!file?.path) return;
        try { await patientUploads.storage.ref(file.path).delete(); }
        catch (error) { console.warn('Could not remove unused prescription:', error.code); }
    }

    function clearPrescription() {
        if (isSubmitting) return;
        uploadVersion++;
        uploadTask?.cancel();
        uploadTask = null;
        isUploading = false;
        failedFile = null;
        const previous = prescription;
        prescription = null;
        rxFile.value = '';
        rxLabel.textContent = 'Choose file (max 5 MB)';
        showError('');
        updateUploadControls();
        void deletePrescription(previous);
    }

    async function uploadPrescription(file) {
        if (!file || isUploading || isSubmitting) return;
        const types = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
        const extension = file.name.split('.').pop().toLowerCase();
        const contentType = types[extension];
        if (!contentType || (file.type && file.type !== contentType) || !file.size || file.size > MAX_FILE) {
            rxFile.value = '';
            showError('Choose a non-empty PDF, JPG or PNG no larger than 5 MB.' +
                (prescription ? ' Your previous prescription is still attached.' : ''));
            return;
        }
        const version = ++uploadVersion;
        const previous = prescription;
        isUploading = true;
        failedFile = file;
        updateUploadControls();
        showError('');
        rxLabel.textContent = `Uploading ${file.name} - 0%`;
        let completedFile = null;
        try {
            const user = await patientUploads.ensureUser();
            if (version !== uploadVersion) return;
            const uploadStorage = patientUploads.storage;
            uploadStorage.setMaxUploadRetryTime(30000);
            const path = `prescriptions/pharmacy/${user.uid}/${crypto.randomUUID()}.${extension}`;
            uploadTask = uploadStorage.ref(path).put(file, {
                contentType, customMetadata: { ownerUid: user.uid, purpose: 'pharmacy' }
            });
            uploadTask.on('state_changed', snapshot => {
                if (version === uploadVersion) rxLabel.textContent = `Uploading ${file.name} - ${Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)}%`;
            });
            const snapshot = await uploadTask;
            completedFile = { path };
            const url = await snapshot.ref.getDownloadURL();
            if (version !== uploadVersion) { await deletePrescription(completedFile); return; }
            prescription = { name: file.name, url, path, ownerUid: user.uid };
            failedFile = null;
            rxLabel.textContent = `${file.name} attached`;
            void deletePrescription(previous);
        } catch (error) {
            await deletePrescription(completedFile);
            if (version !== uploadVersion) return;
            prescription = previous;
            rxLabel.textContent = 'Upload failed. Retry or remove the file to continue.';
            showError('The prescription could not be uploaded. Please retry, or call +254 740 250 696 for help.');
            console.error('Prescription upload failed:', error.code || error.message);
        } finally {
            if (version === uploadVersion) {
                isUploading = false;
                uploadTask = null;
                rxFile.value = '';
                updateUploadControls();
            }
        }
    }

    rxFile.addEventListener('change', () => { void uploadPrescription(rxFile.files[0]); });
    rxRetry.addEventListener('click', () => { void uploadPrescription(failedFile); });
    rxRemove.addEventListener('click', clearPrescription);
    rxDrop.addEventListener('click', event => { if (isUploading || isSubmitting) event.preventDefault(); });
    rxDrop.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isUploading && !isSubmitting) rxFile.click();
        }
    });
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
        rxDrop.addEventListener(name, event => {
            event.preventDefault();
            event.stopPropagation();
            rxDrop.classList.toggle('is-dragover', name === 'dragenter' || name === 'dragover');
            if (name === 'drop' && !isUploading && !isSubmitting) {
                if (event.dataTransfer?.files.length === 1) void uploadPrescription(event.dataTransfer.files[0]);
                else showError('Please upload one prescription at a time.');
            }
        });
    });

    // ---------- submit order ----------
    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = !msg;
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (isSubmitting || isUploading || failedFile) return;
        showError('');
        const data = new FormData(form);
        const name = String(data.get('name') || '').trim();
        const phone = String(data.get('phone') || '').trim();
        const address = String(data.get('address') || '').trim();
        const items = cartItems();

        const notes = String(data.get('notes') || '').trim();
        if (!items.length && !prescription && !notes) return showError('List the medicines you need or upload a prescription.');
        if (!items.length && requestMode === 'cart') return showError('Your cart is empty. Choose Request delivery or Upload prescription to send a request.');
        if (!name || !phone || !address) return showError('Please fill in your name, phone number and delivery address.');
        if (!/^[+\d][\d\s-]{8,15}$/.test(phone)) return showError('Please enter a valid phone number.');
        if ((needsRx() || requestMode === 'prescription') && !prescription) return showError('Please upload your prescription before sending this request.');

        if (!form.checkValidity()) { form.reportValidity(); return; }
        isSubmitting = true;
        updateUploadControls();
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing order...';

        const order = {
            customerName: name,
            phone,
            email: String(data.get('email') || '').trim(),
            deliveryAddress: address,
            landmark: String(data.get('landmark') || '').trim(),
            paymentPreference: data.get('payment') || 'mpesa',
            notes,
            requestType: requestMode === 'prescription' ? 'prescription_delivery' : items.length ? 'cart_delivery' : 'medicine_delivery',
            pricingStatus: !items.length || prescription ? 'requires_review' : 'pending_delivery_fee',
            items: items.map(({ p, qty }) => ({
                productId: p.id,
                name: p.name,
                price: Number(p.price || 0),
                qty,
                subtotal: qty * Number(p.price || 0),
                requiresPrescription: !!p.requiresPrescription
            })),
            itemCount: cartCount(),
            subtotal: cartTotal(),
            prescription: prescription ? { ...prescription } : null,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const ref = await db.collection('pharmacy_orders').add(order);
            document.getElementById('phRef').textContent = ref.id.slice(0, 6).toUpperCase();
            cart = {};
            saveCart();
            prescription = null;
            rxFile.value = '';
            rxLabel.textContent = 'Choose file (max 5 MB)';
            failedFile = null;
            form.reset();
            renderGrid();
            renderCart();
            showStep('done');
        } catch (err) {
            console.error('Order failed:', err);
            showError('Sorry, we couldn\'t place your order. Please try again or call +254 740 250 696.');
        } finally {
            isSubmitting = false;
            updateUploadControls();
            submitBtn.innerHTML = 'Place delivery order';
        }
    });

    renderCart();
    updateUploadControls();
    // ---------- load products ----------
    if (typeof db !== 'undefined') db.collection('pharmacy_products').where('active', '==', true).onSnapshot(snap => {
        products = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        renderChips();
        renderGrid();
        renderCart();
        addFromLink();
        route();
    }, err => {
        console.error('Error loading products:', err);
        statusEl.hidden = false;
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> We couldn\'t load products right now. Please call or WhatsApp us to order.';
    });
    else {
        statusEl.hidden = false;
        statusEl.textContent = 'Products are unavailable right now. You can still request delivery or call our pharmacy.';
    }

    // Staff can change the stock rules at any time - redraw when they do
    let rulesSeen = false;
    Stock.watch(() => {
        if (!rulesSeen) { rulesSeen = true; return; }
        if (!products.length) return;
        renderGrid();
        renderCart();
        const open = new URLSearchParams(window.location.search).get('product');
        if (open && shop.classList.contains('is-detail')) renderDetail(byId(open));
    });

});
