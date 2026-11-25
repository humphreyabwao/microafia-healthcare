// Escape at the HTML rendering boundary; keep stored/form data unchanged.
function escapeAdminHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function escapeAdminJSArgument(value) {
    const encoded = JSON.stringify(String(value == null ? '' : value)).slice(1, -1)
        .replace(/'/g, '\\u0027').replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return escapeAdminHTML(encoded);
}

function safeAdminURL(value) {
    try {
        const url = new URL(String(value), window.location.origin);
        if (url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === window.location.origin)) {
            return url.href;
        }
    } catch (_) { /* Return an inert link for invalid or executable URLs. */ }
    return '#';
}
