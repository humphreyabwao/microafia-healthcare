// Ultrasound & Imaging: search, choose scans, attach a doctor's request, send to lab_orders.
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const form = $('imForm');
    if (!form) return;

    const scans = [...document.querySelectorAll('.im-scan')];
    const chips = [...document.querySelectorAll('.im-chip')];
    const search = $('imSearch');
    const searchClear = $('imSearchClear');
    const count = $('imCount');
    const empty = $('imEmpty');
    const picked = $('imPicked');
    const pickedEmpty = $('imPickedEmpty');
    const totalEl = $('imTotal');
    const totalNote = $('imTotalNote');
    const fileInput = $('imFile');
    const uploadBox = $('imUpload');
    const uploadStatus = $('imUploadStatus');
    const locationWrap = $('imLocationWrap');
    const locationInput = $('imLocation');
    const errorEl = $('imError');
    const submitBtn = $('imSubmit');
    const panel = $('imRequest');
    const done = $('imDone');
    const bar = $('imBar');

    const ksh = n => 'KSh ' + Number(n || 0).toLocaleString('en-US');
    const MAX_BYTES = 5 * 1024 * 1024;
    const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

    let filter = 'all';
    const selected = new Set();       // scan ids
    let uploaded = null;              // { name, url, path, ownerUid }
    let uploadTask = null;
    let uploadVersion = 0;
    let isUploading = false;
    let isSubmitting = false;
    let panelInView = false;          // request panel on screen (hides the phone bar)

    const scanData = el => ({
        id: el.dataset.id,
        name: el.querySelector('.im-scan-name').textContent.trim(),
        price: Number(el.dataset.price) || 0
    });
    const byId = id => scans.find(s => s.dataset.id === id);
    const visit = () => form.elements.visit.value;

    // ---------- search + filter ----------
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    scans.forEach(el => {
        el.dataset.haystack = norm(`${el.textContent} ${el.dataset.keywords || ''}`);
    });

    function applyFilters() {
        const terms = norm(search.value.trim()).split(/\s+/).filter(Boolean);
        let shown = 0;
        scans.forEach(el => {
            const inCategory = filter === 'all' || el.dataset.category === filter;
            const matches = terms.every(t => el.dataset.haystack.includes(t));
            el.hidden = !(inCategory && matches);
            if (!el.hidden) shown++;
        });
        searchClear.hidden = !search.value;
        empty.hidden = shown > 0;
        if (!shown) $('imEmptyTerm').textContent = search.value.trim() || chips.find(c => c.dataset.filter === filter).textContent;
        count.textContent = shown === scans.length ? `${scans.length} scans` : `${shown} of ${scans.length} scans`;
    }

    search.addEventListener('input', applyFilters);
    search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { search.value = ''; applyFilters(); } });
    searchClear.addEventListener('click', () => { search.value = ''; applyFilters(); search.focus(); });
    chips.forEach(chip => chip.addEventListener('click', () => {
        filter = chip.dataset.filter;
        chips.forEach(c => {
            c.classList.toggle('is-active', c === chip);
            c.setAttribute('aria-pressed', String(c === chip));
        });
        applyFilters();
    }));

    // ---------- selection ----------
    function toggle(id, on = !selected.has(id)) {
        if (!byId(id)) return;
        on ? selected.add(id) : selected.delete(id);
        render();
    }

    scans.forEach(el => {
        const btn = el.querySelector('.im-add');
        btn.setAttribute('aria-label', `Add ${scanData(el).name}`);
        btn.addEventListener('click', () => toggle(el.dataset.id));
    });

    picked.addEventListener('click', e => {
        const btn = e.target.closest('[data-remove]');
        if (btn) toggle(btn.dataset.remove, false);
    });

    function chosen() { return scans.filter(el => selected.has(el.dataset.id)).map(scanData); }

    function render() {
        const list = chosen();
        const total = list.reduce((n, s) => n + s.price, 0);

        scans.forEach(el => {
            const on = selected.has(el.dataset.id);
            const btn = el.querySelector('.im-add');
            const name = scanData(el).name;
            el.classList.toggle('is-picked', on);
            btn.setAttribute('aria-pressed', String(on));
            btn.querySelector('span').textContent = on ? 'Added' : 'Add';
            btn.setAttribute('aria-label', on ? `Remove ${name}` : `Add ${name}`);
        });

        picked.replaceChildren(...list.map(s => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = s.name;
            const price = document.createElement('span');
            price.textContent = ksh(s.price);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'im-remove';
            remove.dataset.remove = s.id;
            remove.setAttribute('aria-label', `Remove ${s.name}`);
            remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
            li.append(name, price, remove);
            return li;
        }));
        pickedEmpty.hidden = list.length > 0 || Boolean(uploaded);

        const needsReview = Boolean(uploaded) || visit() === 'mobile';
        totalEl.textContent = !list.length && uploaded ? 'To be confirmed' : ksh(total);
        const notes = [];
        if (uploaded) notes.push(list.length ? 'Other scans on your request are priced when we call.' : "We'll price the scans on your request when we call.");
        if (visit() === 'mobile') notes.push('Plus travel fee for the mobile visit.');
        totalNote.hidden = !needsReview;
        totalNote.textContent = notes.join(' ');

        $('imBarCount').textContent = list.length
            ? `${list.length} scan${list.length === 1 ? '' : 's'}`
            : 'Doctor\'s request';
        $('imBarTotal').textContent = totalEl.textContent;
        bar.hidden = !(list.length || uploaded) || !done.hidden || panelInView;

        submitBtn.disabled = isUploading || isSubmitting;
        uploadBox.setAttribute('aria-disabled', String(isUploading || isSubmitting));
        fileInput.disabled = isUploading || isSubmitting;
    }

    // Hide the phone bar while the request panel itself is on screen
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { panelInView = entry.isIntersecting; render(); }, { threshold: 0.15 }).observe(panel);
    }

    // ---------- where ----------
    form.addEventListener('change', e => {
        if (e.target.name !== 'visit') return;
        const mobile = visit() === 'mobile';
        locationWrap.hidden = !mobile;
        locationInput.required = mobile;
        if (mobile) locationInput.focus();
        render();
    });

    // ---------- upload ----------
    function setStatus(message, { error = false, actions = [] } = {}) {
        uploadStatus.hidden = false;
        uploadStatus.classList.toggle('is-error', error);
        const text = document.createElement('span');
        text.textContent = message;
        uploadStatus.replaceChildren(text, ...actions.map(([label, fn]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'im-upload-action';
            b.textContent = label;
            b.addEventListener('click', fn);
            return b;
        }));
    }

    function hideStatus() { uploadStatus.hidden = true; uploadStatus.replaceChildren(); }

    async function deleteUpload(file) {
        if (!file?.path) return;
        try { await patientUploads.storage.ref(file.path).delete(); }
        catch (error) { console.warn('Could not remove unused imaging request:', error.code); }
    }

    function clearUpload() {
        if (isSubmitting) return;
        uploadVersion++;
        uploadTask?.cancel();
        uploadTask = null;
        isUploading = false;
        const previous = uploaded;
        uploaded = null;
        fileInput.value = '';
        uploadBox.classList.remove('is-attached');
        hideStatus();
        render();
        void deleteUpload(previous);
    }

    async function uploadFile(file) {
        if (!file || isUploading || isSubmitting) return;
        const extension = file.name.split('.').pop().toLowerCase();
        const contentType = TYPES[extension];
        if (!contentType || (file.type && file.type !== contentType) || !file.size || file.size > MAX_BYTES) {
            fileInput.value = '';
            setStatus('Choose a PDF, JPG or PNG file up to 5 MB.' + (uploaded ? ' Your previous file is still attached.' : ''),
                { error: true, actions: uploaded ? [['Remove', clearUpload]] : [['OK', hideStatus]] });
            return;
        }

        const version = ++uploadVersion;
        const previous = uploaded;
        isUploading = true;
        render();
        setStatus(`Uploading ${file.name}… 0%`, { actions: [['Cancel', clearUpload]] });
        let completed = null;
        try {
            const user = await patientUploads.ensureUser();
            if (version !== uploadVersion) return;
            const store = patientUploads.storage;
            store.setMaxUploadRetryTime(30000);
            const path = `prescriptions/lab/${user.uid}/${crypto.randomUUID()}.${extension}`;
            uploadTask = store.ref(path).put(file, { contentType, customMetadata: { ownerUid: user.uid, purpose: 'lab' } });
            uploadTask.on('state_changed', snap => {
                if (version !== uploadVersion) return;
                const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
                uploadStatus.querySelector('span').textContent = `Uploading ${file.name}… ${pct}%`;
            });
            const snapshot = await uploadTask;
            completed = { path };
            const url = await snapshot.ref.getDownloadURL();
            if (version !== uploadVersion) { await deleteUpload(completed); return; }
            uploaded = { name: file.name, url, path, ownerUid: user.uid };
            uploadBox.classList.add('is-attached');
            setStatus(`${file.name} attached`, { actions: [['Replace', () => fileInput.click()], ['Remove', clearUpload]] });
            void deleteUpload(previous);
        } catch (error) {
            await deleteUpload(completed);
            if (version !== uploadVersion) return;
            uploaded = previous;
            console.error('Imaging request upload failed:', error.code || error.message);
            const message = error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated'
                ? 'The upload service could not accept this file. Retry, or call +254 740 250 696.'
                : 'Upload failed. Check your connection and retry, or call +254 740 250 696.';
            setStatus(message, { error: true, actions: [['Retry', () => uploadFile(file)], ['Remove', clearUpload]] });
        } finally {
            if (version === uploadVersion) {
                uploadTask = null;
                isUploading = false;
                fileInput.value = '';
                render();
            }
        }
    }

    fileInput.addEventListener('change', () => void uploadFile(fileInput.files[0]));
    uploadBox.addEventListener('click', e => { if (isUploading || isSubmitting) e.preventDefault(); });
    uploadBox.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isUploading && !isSubmitting) fileInput.click();
        }
    });
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(type => uploadBox.addEventListener(type, e => {
        e.preventDefault();
        uploadBox.classList.toggle('is-dragover', type === 'dragenter' || type === 'dragover');
        if (type !== 'drop') return;
        const files = e.dataTransfer?.files;
        if (files?.length === 1) void uploadFile(files[0]);
        else if (files?.length > 1) setStatus('Please upload one file at a time.', { error: true, actions: [['OK', hideStatus]] });
    }));

    // Hero "Upload a doctor's request"
    document.querySelector('[data-im-upload-jump]')?.addEventListener('click', e => {
        e.preventDefault();
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!isUploading && !isSubmitting && !uploaded) fileInput.click();
    });

    // ---------- submit ----------
    $('imDate').min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    function fail(message, field) {
        errorEl.textContent = message;
        errorEl.hidden = false;
        if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
        else errorEl.scrollIntoView({ block: 'nearest' });
    }

    form.addEventListener('input', e => {
        if (e.target.hasAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (isSubmitting || isUploading) return;
        errorEl.hidden = true;

        const list = chosen();
        const name = form.elements.fullName.value.trim();
        const phone = form.elements.phone.value.trim();
        const email = form.elements.email.value.trim();
        const mobile = visit() === 'mobile';
        const where = locationInput.value.trim();

        if (!list.length && !uploaded) return fail("Add at least one scan, or upload your doctor's request.");
        if (!name) return fail('Please enter your full name.', form.elements.fullName);
        if (phone.replace(/\D/g, '').length < 9) return fail('Please enter a phone number we can call.', form.elements.phone);
        if (email && !form.elements.email.checkValidity()) return fail('Please check your email address.', form.elements.email);
        if (mobile && !where) return fail('Tell us where to come for the mobile scan.', locationInput);

        const noteParts = [];
        if (form.elements.date.value) noteParts.push(`Preferred date: ${form.elements.date.value}`);
        if (form.elements.notes.value.trim()) noteParts.push(form.elements.notes.value.trim());
        const total = list.reduce((n, s) => n + s.price, 0);

        const order = {
            customerName: name,
            phone,
            email: email || 'Not provided',
            notes: noteParts.join('\n') || 'None',
            tests: list.map(s => ({ name: s.name, price: s.price })),
            total,
            prescription: uploaded ? { ...uploaded } : null,
            pricingStatus: uploaded || mobile ? 'requires_review' : 'confirmed',
            collectionMethod: mobile ? 'mobile' : 'clinic',
            location: mobile ? where : 'Clinic',
            category: 'imaging',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        };

        isSubmitting = true;
        render();
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Sending…';
        try {
            await db.collection('lab_orders').add(order);
        } catch (error) {
            console.error('Imaging request failed:', error);
            isSubmitting = false;
            submitBtn.textContent = 'Send request';
            render();
            return fail("We couldn't send your request. Please try again, or call +254 740 250 696.");
        }

        isSubmitting = false;
        submitBtn.textContent = 'Send request';
        const what = list.length ? list.map(s => s.name).join(', ') : "the scans on your doctor's request";
        $('imDoneText').textContent = `We'll call ${phone} shortly to confirm ${what} ${mobile ? 'at your location' : 'at our clinic'}.`;

        // The uploaded file now belongs to the order; forget it without deleting.
        uploaded = null;
        uploadBox.classList.remove('is-attached');
        hideStatus();
        selected.clear();
        form.reset();
        locationWrap.hidden = true;
        locationInput.required = false;
        form.hidden = true;
        done.hidden = false;
        render();
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        done.querySelector('h2').focus({ preventScroll: true });
    });

    $('imAgain').addEventListener('click', () => {
        done.hidden = true;
        form.hidden = false;
        render();
        document.getElementById('scans').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ---------- deep links: /imaging-services?scan=obstetric ----------
    const pre = new URLSearchParams(location.search).get('scan');
    if (pre && byId(pre)) selected.add(pre);

    applyFilters();
    render();
});
