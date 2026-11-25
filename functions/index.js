// Microafia Healthcare - customer-care chatbot endpoint.
// Firebase Hosting rewrites POST /api/chat to this function (see firebase.json).
// The Anthropic API key is a Firebase secret:  firebase functions:secrets:set ANTHROPIC_API_KEY
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./knowledge.js";
import { rateLimited, cleanHistory } from "./request-policy.js";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MODEL = "claude-opus-5-5";

const ALLOWED_ORIGINS = [
    "https://www.microafiahealthcare.co.ke",
    "https://microafiahealthcare.co.ke",
    "https://microafia-c4232.web.app",
    "https://microafia-c4232.firebaseapp.com",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
];

const FALLBACK_REPLY =
    "Sorry, I can't answer that right now. Please call or WhatsApp us on +254 740 250 696 and our team will help.";

let client = null;
export const chat = onRequest(
    {
        region: "us-central1",
        secrets: [ANTHROPIC_API_KEY],
        cors: ALLOWED_ORIGINS,
        timeoutSeconds: 60,
        memory: "256MiB",
        maxInstances: 5,
    },
    async (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        if (req.method !== "POST") {
            res.status(405).json({ error: "method_not_allowed" });
            return;
        }

        const origin = req.get('origin');
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
            res.status(403).json({ error: 'origin_not_allowed' });
            return;
        }
        if (!req.is('application/json')) {
            res.status(415).json({ error: 'json_required' });
            return;
        }
        if (req.rawBody && req.rawBody.length > 64 * 1024) {
            res.status(413).json({ error: 'request_too_large' });
            return;
        }
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        if (rateLimited(ip)) {
            res.set('Retry-After', '60');
            res.status(429).json({ error: "rate_limited", reply: "You're sending messages quickly - please wait a moment and try again." });
            return;
        }

        const messages = cleanHistory(req.body && req.body.messages);
        if (!messages) {
            res.status(400).json({ error: "bad_request" });
            return;
        }

        client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 2, timeout: 45_000 });

        try {
            const response = await client.beta.messages.create({
                model: MODEL,
                max_tokens: 16000,
                // Chat answers come from the briefing - low effort keeps replies fast and cheap
                output_config: { effort: "low" },
                // If a request is declined, the API retries it on a fallback model automatically
                betas: ["server-side-fallback-2026-07-01"],
                fallbacks: "default",
                // The briefing never changes between requests, so cache it
                system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
                messages,
            });

            if (response.stop_reason === "refusal") {
                res.json({ reply: FALLBACK_REPLY });
                return;
            }

            const reply = response.content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("\n")
                .trim();

            logger.info("chat", {
                in: response.usage.input_tokens,
                cacheRead: response.usage.cache_read_input_tokens,
                out: response.usage.output_tokens,
            });

            res.json({ reply: reply || FALLBACK_REPLY });
        } catch (err) {
            if (err instanceof Anthropic.RateLimitError) {
                logger.warn("anthropic rate limited");
                res.status(503).json({ error: "busy" });
            } else if (err instanceof Anthropic.AuthenticationError) {
                logger.error("anthropic auth failed - check the ANTHROPIC_API_KEY secret");
                res.status(503).json({ error: "unavailable" });
            } else if (err instanceof Anthropic.APIError) {
                logger.error("anthropic api error", {
                    status: err.status,
                    type: err.error?.error?.type,
                    detail: String(err.error?.error?.message || "").slice(0, 300),
                    requestId: err.requestID,
                });
                res.status(503).json({ error: "unavailable" });
            } else {
                logger.error("chat failed", { type: err && err.name });
                res.status(503).json({ error: "unavailable" });
            }
        }
    }
);
