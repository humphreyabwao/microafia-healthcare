// Bloodline Show applications - Microafia Admin
// Collection: `bloodline_applications` (written by /bloodline-apply)
let blApps = [];
let blFilter = 'all';
let blSearch = '';
let blDeleteId = null;

const BL_STATUSES = {
    new: 'New',
    contacted: 'Contacted',
    shortlisted: 'Shortlisted',
    tested: 'Tested',
    featured: 'Featured',
    declined: 'Declined'
};

const BL_TESTS = {
    paternity: 'Paternity',
    maternity: 'Maternity',
    siblings: 'Siblings',
    grandparent: 'Grandparent',
    other: 'Other'
};

// Applicant text is public input - always escape before showing it
function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function canDo(action) {
    const user = typeof getCurrentUserData === 'function' ? getCurrentUserData() : null;
    if (!user || user.role === 'admin') return true;
    return hasPermission('bloodline', action);
}

document.addEventListener('DOMContentLoaded', function () {
    firebase.firestore().collection('bloodline_applications')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            blApps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const count = s => blApps.filter(a => (a.status || 'new') === s).length;
            document.getElementById('newCount').textContent = count('new');
            document.getElementById('shortlistedCount').textContent = count('shortlisted');
            document.getElementById('featuredCount').textContent = count('featured');
            document.getElementById('totalCount').textContent = blApps.length;
            renderApps();
        }, err => {
            console.error('Error loading applications:', err);
            document.getElementById('tableBody').innerHTML =
                '<tr><td colspan="6" class="loading-row"><i class="fas fa-exclamation-circle"></i> Error loading applications</td></tr>';
        });

    document.getElementById('statusFilter').addEventListener('change', e => { blFilter = e.target.value; renderApps(); });
    document.getElementById('searchInput').addEventListener('input', e => { blSearch = e.target.value.toLowerCase(); renderApps(); });

    const tbody = document.getElementById('tableBody');
    tbody.addEventListener('change', e => {
        const sel = e.target.closest('[data-status]');
        if (!sel) return;
        if (!canDo('edit')) { showToast("You don't have permission to do that", 'error'); renderApps(); return; }
        firebase.firestore().collection('bloodline_applications').doc(sel.dataset.id).update({
            status: sel.value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => showToast('Status updated'))
          .catch(err => { console.error(err); showToast('Error updating status', 'error'); });
    });
    tbody.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'view') viewApp(btn.dataset.id);
        if (btn.dataset.action === 'delete') {
            if (!canDo('delete')) return showToast("You don't have permission to do that", 'error');
            blDeleteId = btn.dataset.id;
            openModal('deleteModal');
        }
    });
});

function renderApps() {
    const tbody = document.getElementById('tableBody');
    const list = blApps.filter(a => {
        if (blFilter !== 'all' && (a.status || 'new') !== blFilter) return false;
        if (!blSearch) return true;
        return `${a.fullName} ${a.phone} ${a.email} ${a.location} ${a.people} ${a.story}`.toLowerCase().includes(blSearch);
    });
    const empty = !list.length;
    document.getElementById('emptyState').style.display = empty ? 'block' : 'none';
    document.getElementById('tableWrap').style.display = empty ? 'none' : 'block';
    if (empty) { tbody.innerHTML = ''; return; }

    tbody.innerHTML = list.map(a => {
        const status = a.status || 'new';
        const when = a.createdAt && a.createdAt.toDate ? formatDate(a.createdAt.toDate()) : '';
        return `
            <tr class="${status === 'new' ? 'bl-row-new' : ''}">
                <td>
                    <div class="customer-info">
                        <span class="customer-name">${esc(a.fullName || 'N/A')}</span>
                        <a class="customer-email" href="tel:${esc(a.phone)}">${esc(a.phone || '')}</a>
                        <span class="customer-email">${esc(when)}</span>
                    </div>
                </td>
                <td>${esc(a.location || '-')}</td>
                <td><span class="test-badge">${esc(BL_TESTS[a.testType] || a.testType || '-')}</span></td>
                <td class="bl-story-cell">${esc(a.story || '')}</td>
                <td>
                    <select class="status-select" data-status data-id="${a.id}">
                        ${Object.entries(BL_STATUSES).map(([v, label]) =>
                            `<option value="${v}" ${v === status ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" data-action="view" data-id="${a.id}" title="View"><i class="fas fa-eye"></i></button>
                        <button class="btn-action btn-delete" data-action="delete" data-id="${a.id}" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function viewApp(id) {
    const a = blApps.find(x => x.id === id);
    if (!a) return;
    const row = (label, value) =>
        `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`;
    const yes = v => v ? '<span class="bl-yes"><i class="fas fa-check"></i> Yes</span>' : 'No';
    document.getElementById('viewModalBody').innerHTML =
        row('Reference', esc(a.id.slice(0, 6).toUpperCase())) +
        row('Name', esc(a.fullName || 'N/A')) +
        row('Phone', `<a href="tel:${esc(a.phone)}">${esc(a.phone || 'N/A')}</a>`) +
        row('Email', a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : '-') +
        row('Town / area', esc(a.location || '-')) +
        row('DNA question', esc(BL_TESTS[a.testType] || a.testType || '-')) +
        row('Who would be tested', esc(a.people || '-')) +
        `<div class="detail-row"><span class="detail-label">Story</span><span class="detail-value bl-story-full">${esc(a.story || '-')}</span></div>` +
        row('All parties consent', yes(a.consentTest)) +
        row('Agrees to appear on show', yes(a.consentShow)) +
        row('Status', `<span class="status-badge ${esc(a.status || 'new')}">${BL_STATUSES[a.status || 'new'] || esc(a.status)}</span>`) +
        row('Applied', a.createdAt && a.createdAt.toDate ? formatDate(a.createdAt.toDate()) : 'N/A');
    openModal('viewModal');
}

function confirmDelete() {
    if (!blDeleteId) return;
    firebase.firestore().collection('bloodline_applications').doc(blDeleteId).delete()
        .then(() => { closeModal('deleteModal'); showToast('Application deleted'); })
        .catch(err => { console.error(err); showToast('Error deleting application', 'error'); })
        .finally(() => { blDeleteId = null; });
}

// ---------- helpers (same behaviour as other admin modules) ----------
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = message;
    toast.style.background = type === 'error' ? '#dc2626' : '#064e3b';
    toast.querySelector('i').className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});

// ========================================
// Show video tab - the episode playing on the homepage
// Saved to site_content/bloodline; the website listens to it live.
// ========================================
(function () {
    const DEFAULT = { videoId: 'CM-3EyzJB10', episode: 'S01 E22', title: 'The DNA Results Are In: In-Law or Outlaw?' };
    const $ = id => document.getElementById(id);
    const form = $('blvForm');
    if (!form) return;
    const url = $('blvUrl'), episode = $('blvEpisode'), title = $('blvTitle');
    const hint = $('blvHint'), meta = $('blvMeta'), save = $('blvSave');
    let current = null, dirty = false, lookupFor = '';

    // ---- tabs ----
    document.querySelectorAll('[data-bl-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-bl-tab]').forEach(t => {
                const on = t === tab;
                t.classList.toggle('is-active', on);
                t.setAttribute('aria-selected', String(on));
                document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
            });
        });
    });

    // Accepts watch?v=, youtu.be/, shorts/, embed/, live/ links or a bare 11-character ID
    function videoIdFrom(value) {
        const v = String(value || '').trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
        try {
            const u = new URL(v);
            if (!/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(u.hostname)) return null;
            const id = u.hostname === 'youtu.be' ? u.pathname.slice(1)
                : u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1];
            return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
        } catch (_) { return null; }
    }

    function preview() {
        const id = videoIdFrom(url.value) || (current && current.videoId) || DEFAULT.videoId;
        $('blvThumb').src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        $('blvPrevEpisode').textContent = episode.value.trim() ? 'Latest episode · ' + episode.value.trim() : 'Latest episode';
        $('blvPrevTitle').textContent = title.value.trim();
    }

    function fill(data) {
        url.value = `https://www.youtube.com/watch?v=${data.videoId}`;
        episode.value = data.episode || '';
        title.value = data.title || '';
        dirty = false;
        preview();
    }

    // Fill in the title and episode from YouTube when a new link is pasted
    async function lookup(id) {
        lookupFor = id;
        hint.className = 'blv-hint';
        hint.textContent = 'Looking up the video…';
        try {
            const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
            if (lookupFor !== id) return;
            if (!res.ok) throw new Error(res.status === 404 || res.status === 401 ? 'private' : 'lookup');
            const info = await res.json();
            const raw = String(info.title || '');
            const ep = (raw.match(/\((S\d+\s*E\d+)\)/i) || [])[1];
            const clean = raw.split(' | ')[0].replace(/\((S\d+\s*E\d+)\)/i, '').trim();
            episode.value = ep ? ep.toUpperCase().replace(/\s+/, ' ') : '';   // never keep the old episode number
            if (clean) title.value = clean.slice(0, 200);
            hint.textContent = 'Found: ' + raw;
            hint.classList.add('is-ok');
        } catch (err) {
            if (lookupFor !== id) return;
            hint.textContent = err.message === 'private'
                ? 'YouTube says this video is private or can\'t be embedded - check its sharing settings.'
                : 'Couldn\'t fetch the title automatically - type it in below.';
            hint.classList.add('is-warn');
        }
        preview();
    }

    url.addEventListener('input', () => {
        dirty = true;
        const id = videoIdFrom(url.value);
        if (!url.value.trim()) { hint.textContent = ''; hint.className = 'blv-hint'; }
        else if (!id) { hint.textContent = 'That doesn\'t look like a YouTube video link.'; hint.className = 'blv-hint is-warn'; }
        else if (!current || id !== current.videoId) lookup(id);
        else { hint.textContent = 'This is the video on the website now.'; hint.className = 'blv-hint'; }
        preview();
    });
    [episode, title].forEach(el => el.addEventListener('input', () => { dirty = true; preview(); }));

    form.addEventListener('submit', async evt => {
        evt.preventDefault();
        if (!canDo('edit')) { showToast('You do not have permission to change the show video.', 'error'); return; }
        const id = videoIdFrom(url.value);
        if (!id) { hint.textContent = 'Paste a YouTube video link first.'; hint.className = 'blv-hint is-warn'; url.focus(); return; }
        const user = typeof getCurrentUserData === 'function' ? getCurrentUserData() : null;
        save.disabled = true; save.textContent = 'Publishing…';
        try {
            await firebase.firestore().collection('site_content').doc('bloodline').set({
                videoId: id,
                episode: episode.value.trim().slice(0, 60),
                title: title.value.trim().slice(0, 200),
                updatedBy: String((user && (user.name || user.email)) || 'Staff').slice(0, 200),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            dirty = false;
            showToast('Published - the website is now showing this episode.');
        } catch (err) {
            console.error('Saving show video failed:', err.code || err.message);
            showToast(err.code === 'permission-denied' ? 'You do not have permission to change the show video.' : 'Could not publish. Please try again.', 'error');
        } finally {
            save.disabled = false; save.textContent = 'Save and publish';
        }
    });

    // Live: shows what the website is playing, even if another staff member changes it
    firebase.firestore().collection('site_content').doc('bloodline').onSnapshot(doc => {
        current = doc.exists ? doc.data() : null;
        const data = current || DEFAULT;
        if (!dirty) fill(data);
        if (current && current.updatedAt && current.updatedAt.toDate) {
            meta.textContent = `On the website now · updated ${current.updatedAt.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${current.updatedBy ? ' by ' + current.updatedBy : ''}`;
        } else {
            meta.textContent = 'On the website now · the original episode (not changed yet)';
        }
    }, err => {
        console.error('Reading show video failed:', err.code || err.message);
        if (!dirty) fill(DEFAULT);
    });
})();
