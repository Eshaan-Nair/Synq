"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrubPII = scrubPII;
// Scrubs common secrets from text before sending to Groq.
// Add new patterns at the TOP of the chain so they run before broader regexes.
function scrubPII(text) {
    return text
        // JWT tokens (most specific — must come first)
        .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[REDACTED_JWT]")
        // Bearer tokens in headers
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED_TOKEN]")
        // sk- / pk- / ak- / rk- style API keys (OpenAI, Anthropic, Stripe, etc.)
        .replace(/\b(sk|pk|ak|rk|gsk|xai)-[A-Za-z0-9\-]{20,}\b/g, "[REDACTED_KEY]")
        // GitHub personal access tokens (ghp_, gho_, ghs_, ghu_)
        .replace(/\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{36,}\b/g, "[REDACTED_GITHUB_TOKEN]")
        // Dotted key format (e.g. key.secret.token segments)
        .replace(/\b[A-Za-z0-9]{8,}\.[A-Za-z0-9]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, "[REDACTED_KEY]")
        // .env style assignments  (SECRET=, PASSWORD=, TOKEN=, KEY=, etc.)
        .replace(/(SECRET|PASSWORD|TOKEN|KEY|API_KEY|AUTH|CREDENTIAL|PRIVATE)\s*=\s*\S+/gi, "$1=[REDACTED]")
        // Connection strings (mongodb://, postgres://, mysql://, redis://)
        .replace(/(mongodb|postgres|postgresql|mysql|redis|amqp):\/\/[^\s"']+/gi, "$1://[REDACTED_CONNECTION_STRING]")
        // IPv4 addresses that look like internal/sensitive endpoints
        .replace(/\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g, "[REDACTED_INTERNAL_IP]")
        // Email addresses
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
}
