// Scrubs common secrets from text before processing
export function scrubPII(text: string): string {
  return text
    // JWT tokens (must come first — most specific pattern)
    .replace(
      /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
      "[REDACTED_JWT]"
    )
    // sk- / pk- / ak- style API keys (OpenAI, Anthropic, Stripe etc)
    .replace(
      /\b(sk|pk|ak|rk)-[A-Za-z0-9\-]{20,}\b/g,
      "[REDACTED_KEY]"
    )
    // Dotted key format (e.g. key.secret.token segments)
    .replace(
      /\b[A-Za-z0-9]{8,}\.[A-Za-z0-9]{8,}\.[A-Za-z0-9_\-]{8,}\b/g,
      "[REDACTED_KEY]"
    )
    // .env style assignments
    .replace(
      /(SECRET|PASSWORD|TOKEN|KEY)\s*=\s*\S+/gi,
      "$1=[REDACTED]"
    )
    // Email addresses
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[REDACTED_EMAIL]"
    );
}