/* ========================================
   Shared tools for admin module pages
   - Export the table you are looking at (current filters) to Excel or PDF
   - Label table cells so rows become readable cards on phones
   ======================================== */
(function () {
    'use strict';

    const PDF_LIBS = [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js',
          integrity: 'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.9/jspdf.plugin.autotable.min.js',
          integrity: 'sha384-A77YsHWitrPuAj8E0AuB033EXzymUxIajnWKPzrrzqFoYYSCEpFennDUjMG2R1L3' }
    ];
    const SKIP_HEADERS = /^(actions?|)$/i;

    // ---------- read the visible table ----------
    function headerCells(table) {
        return [...table.querySelectorAll('thead th')].map(th => th.textContent.replace(/\s+/g, ' ').trim());
    }

    function cellText(td) {
        if (td.dataset.export) return td.dataset.export;   // full value when the cell shows a shortened list
        const copy = td.cloneNode(true);
        copy.querySelectorAll('select').forEach(sel => {
            const live = td.querySelector(`select[id="${sel.id}"]`) || td.querySelector('select');
            const opt = live && live.options[live.selectedIndex];
            sel.replaceWith(document.createTextNode(opt ? opt.text : ''));
        });
        copy.querySelectorAll('.status-options, .action-buttons, button, .sr-only, script, style').forEach(el => el.remove());
        copy.querySelectorAll('br').forEach(br => br.replaceWith(' '));
        const badges = [...copy.querySelectorAll('.test-badge')];
        if (badges.length) {   // lists of tests / items: keep them comma separated
            const names = badges.map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
            badges.forEach(b => b.remove());
            const rest = copy.textContent.replace(/\s+/g, ' ').trim();
            return [names.join(', '), rest].filter(Boolean).join(' ');
        }
        const parts = [...copy.children].map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (parts.length > 1 && !copy.querySelector('.status-badge')) return parts.join(' · ');   // e.g. name + date
        copy.querySelectorAll('.service-badge, .status-badge, span, div, p').forEach(el => el.append(' '));
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }

    function readTable(table) {
        const heads = headerCells(table);
        const keep = heads.map((h, i) => !SKIP_HEADERS.test(h) ? i : -1).filter(i => i >= 0);
        const rows = [...table.querySelectorAll('tbody tr')]
            .filter(tr => tr.offsetParent !== null || !tr.closest('[hidden]'))
            .filter(tr => !tr.querySelector('td[colspan]'))
            .map(tr => { const tds = [...tr.children]; return keep.map(i => tds[i] ? cellText(tds[i]) : ''); });
        return { headers: keep.map(i => heads[i]), rows };
    }

    function moduleName(card) {
        const panel = card.closest('[data-panel], .ph-panel, [role="tabpanel"]');
        const tab = panel && document.querySelector(`[data-tab="${panel.dataset.panel || panel.id}"]`);
        const page = (document.querySelector('.page-title') || {}).textContent || document.title.split(' - ')[0];
        const extra = tab ? tab.textContent.trim() : (panel && panel.getAttribute('aria-label')) || '';
        return [page.trim(), extra].filter(Boolean).join(' - ');
    }

    function fileName(title, ext) {
        const d = new Date();
        const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return `microafia-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${stamp}.${ext}`;
    }

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ---------- Excel (.xlsx) - written directly, no library ----------
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        return t;
    })();
    function crc32(bytes) {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }
    function zip(files) {   // files: [{ name, data: Uint8Array }] - stored (no compression)
        const enc = new TextEncoder(), parts = [], central = [];
        let offset = 0;
        files.forEach(f => {
            const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
            local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
            local.setUint16(26, name.length, true);
            parts.push(new Uint8Array(local.buffer), name, f.data);
            const cen = new DataView(new ArrayBuffer(46));
            cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
            cen.setUint32(16, crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true);
            cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
            central.push(new Uint8Array(cen.buffer), name);
            offset += 30 + name.length + size;
        });
        const cenSize = central.reduce((n, p) => n + p.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
        end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
        return new Blob([...parts, ...central, new Uint8Array(end.buffer)],
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

    function toXlsx(title, data) {
        const all = [data.headers, ...data.rows];
        const widths = data.headers.map((_, c) => Math.min(60, Math.max(10, ...all.map(r => String(r[c] || '').length + 2))));
        const cell = (v, r, c, head) => {
            const ref = colName(c) + (r + 1);
            const plain = String(v).replace(/^KSh\s*/i, '').replace(/,/g, '');
            if (!head && v !== '' && /^-?\d+(\.\d+)?$/.test(plain) && plain.length < 15 && !/^0\d/.test(plain)) {
                return `<c r="${ref}"><v>${plain}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"${head ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        };
        const sheetRows = all.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c, r === 0)).join('')}</row>`).join('');
        const last = colName(Math.max(0, data.headers.length - 1)) + all.length;
        const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
        const sheetName = xml(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export');
        const files = {
            '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
            '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
            'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
            'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
            'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF064E3B"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
            'xl/worksheets/sheet1.xml': sheet
        };
        const enc = new TextEncoder();
        return zip(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })));
    }

    // ---------- PDF (jsPDF loaded only when first needed) ----------
    let pdfReady = null;
    function loadPdfLibs() {
        if (pdfReady) return pdfReady;
        pdfReady = PDF_LIBS.reduce((p, lib) => p.then(() => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = lib.src; s.integrity = lib.integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
            s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + lib.src));
            document.head.appendChild(s);
        })), Promise.resolve()).catch(err => { pdfReady = null; throw err; });
        return pdfReady;
    }

    async function toPdf(title, data) {
        await loadPdfLibs();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: data.headers.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(6, 78, 59);
        doc.text('Microafia Healthcare', 40, 44);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(55, 65, 81);
        doc.text(title, 40, 62);
        doc.setFontSize(9); doc.setTextColor(107, 114, 128);
        const stamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
        doc.text(`${data.rows.length} record${data.rows.length === 1 ? '' : 's'} · exported ${stamp}`, W - 40, 62, { align: 'right' });
        window.autoTable(doc, {
            head: [data.headers], body: data.rows, startY: 76, margin: { left: 40, right: 40, bottom: 40 },
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.5, overflow: 'linebreak' },
            headStyles: { fillColor: [6, 78, 59], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            didDrawPage: () => {
                doc.setFontSize(8); doc.setTextColor(156, 163, 175);
                doc.text(`Page ${doc.internal.getNumberOfPages()} · Confidential - contains patient information`, 40, doc.internal.pageSize.getHeight() - 20);
            }
        });
        doc.save(fileName(title, 'pdf'));
    }

    // ---------- UI ----------
    function notify(msg, type) {
        if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
        let el = document.getElementById('mtToast');
        if (!el) { el = Object.assign(document.createElement('div'), { id: 'mtToast', className: 'mt-toast' }); el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.textContent = msg; el.className = 'mt-toast is-on' + (type === 'error' ? ' is-error' : '');
        clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('is-on'), 3000);
    }

    function addExport(card) {
        const table = card.querySelector('table');
        if (!table || card.dataset.exportReady) return;
        card.dataset.exportReady = '1';
        const group = document.createElement('div');
        group.className = 'mt-export';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Export');
        group.innerHTML = `
            <span class="mt-export-label">Export</span>
            <button type="button" class="mt-export-btn" data-format="xlsx" title="Download the rows shown as an Excel file"><i class="fas fa-file-excel" aria-hidden="true"></i> Excel</button>
            <button type="button" class="mt-export-btn" data-format="pdf" title="Download the rows shown as a PDF"><i class="fas fa-file-pdf" aria-hidden="true"></i> PDF</button>`;
        let prev = card.previousElementSibling;
        while (prev && !prev.classList.contains('filter-bar') && !prev.classList.contains('table-card')) prev = prev.previousElementSibling;
        if (prev && prev.classList.contains('filter-bar')) {
            prev.appendChild(group);
        } else {
            const bar = document.createElement('div');
            bar.className = 'mt-toolbar';
            bar.appendChild(group);
            card.parentNode.insertBefore(bar, card);
        }
        group.addEventListener('click', async evt => {
            const btn = evt.target.closest('.mt-export-btn');
            if (!btn || btn.disabled) return;
            const data = readTable(table);
            const title = moduleName(card);
            if (!data.rows.length) { notify('Nothing to export - no rows match the current filters.', 'error'); return; }
            const label = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Preparing';
            try {
                if (btn.dataset.format === 'xlsx') download(toXlsx(title, data), fileName(title, 'xlsx'));
                else await toPdf(title, data);
                notify(`Exported ${data.rows.length} record${data.rows.length === 1 ? '' : 's'}.`);
            } catch (err) {
                console.error('Export failed:', err);
                notify('Export failed. Check your connection and try again.', 'error');
            } finally {
                btn.disabled = false; btn.innerHTML = label;
            }
        });
    }

    // Phone layout: each cell carries its column name so rows can stack as cards
    function labelCells(table) {
        const heads = headerCells(table);
        table.querySelectorAll('tbody tr').forEach(tr => {
            [...tr.children].forEach((td, i) => {
                if (td.tagName === 'TD' && !td.hasAttribute('colspan') && heads[i] && td.dataset.label !== heads[i]) td.dataset.label = heads[i];
            });
        });
    }

    function init() {
        document.querySelectorAll('.main-content .table-card').forEach(card => {
            const table = card.querySelector('table');
            if (!table) return;
            table.classList.add('mt-cards');
            addExport(card);
            labelCells(table);
            const body = table.tBodies[0];
            if (body) new MutationObserver(() => labelCells(table)).observe(body, { childList: true, subtree: true });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.__moduleTools = { readTable, toXlsx, loadPdfLibs };
})();
