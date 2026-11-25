// Pure request checks; test without calling a model or a production service.
export const MAX_TURNS = 12;
const MAX_CHARS = 1000;
const RATE_LIMIT = 12;
const WINDOW = 60_000;
const hits = new Map();

export function rateLimited(ip, now = Date.now()) {
    if (!hits.has(ip) && hits.size >= 5000) {
        for (const [key, times] of hits) {
            if (!times.some(time => now - time < WINDOW)) hits.delete(key);
        }
        if (hits.size >= 5000) return true;
    }
    const recent = (hits.get(ip) || []).filter(time => now - time < WINDOW);
    // Do not let one abusive sender grow a timestamp list indefinitely.
    if (recent.length >= RATE_LIMIT) { hits.set(ip, recent); return true; }
    recent.push(now);
    hits.set(ip, recent);
    return false;
}

export function cleanHistory(raw) {
    if (!Array.isArray(raw)) return null;
    const messages = raw.slice(-MAX_TURNS)
        .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
        .map(message => ({ role: message.role, content: message.content.trim().slice(0, message.role === 'user' ? MAX_CHARS : 4000) }))
        .filter(message => message.content);
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length || messages.at(-1).role !== 'user') return null;
    if (messages.some((message, index) => index && message.role === messages[index - 1].role)) return null;
    return messages;
}
