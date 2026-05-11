/**
 * resolver.ts — Multi-Strategy DOM Selector Resolver
 *
 * Platform UIs update frequently. This module tries multiple CSS selector
 * strategies in priority order so GLIA stays functional even after UI changes.
 *
 * Strategy cascade (per platform):
 *   1. Primary (most stable — data-testid / component-specific)
 *   2. aria-label fallback
 *   3. role attribute fallback
 *   4. placeholder text fallback
 *   5. Generic contenteditable fallback
 *
 * Updated: v1.4.2
 */

export type Platform = "claude" | "chatgpt" | "gemini" | "deepseek" | "grok" | "copilot" | "mistral";

export const INPUT_SELECTOR_STRATEGIES: Record<Platform, string[]> = {
  claude: [
    'div.ProseMirror',                                        // confirmed live DOM (April 2025)
    '[contenteditable="true"][data-placeholder]',             // placeholder variant
    '[aria-label="Message Claude"]',                          // aria fallback
    '[data-testid="composer-input"]',                         // testid fallback
    'div[contenteditable][role="textbox"]',                   // role fallback
    'div[contenteditable][placeholder*="Claude"]',            // placeholder text fallback
    'div[contenteditable="true"]',                            // generic fallback
  ],
  chatgpt: [
    '#prompt-textarea',                                       // primary — stable ID
    '[data-testid="prompt-textarea"]',                        // testid fallback
    'div[contenteditable][placeholder*="Message"]',           // placeholder fallback
    'div[contenteditable="true"]',                            // generic fallback
  ],
  gemini: [
    '.ql-editor',                                             // Quill editor — confirmed
    'rich-textarea [contenteditable="true"]',                 // inner editable
    '[aria-label*="message"]',                                // aria fallback
    'div[contenteditable][role="textbox"]',                   // role fallback
    'div[contenteditable="true"]',                            // generic fallback
  ],
  deepseek: [
    '#chat-input',                                            // primary — stable id
    'textarea[placeholder*="Send a message"]',                // placeholder fallback
    'textarea[data-testid="chat-input"]',                     // testid fallback
    '[contenteditable="true"][aria-label*="message"]',        // contenteditable variant
    'div[contenteditable][role="textbox"]',                   // role fallback
    'textarea',                                               // generic textarea fallback
  ],
  grok: [
    "textarea[placeholder*='Ask']",
    "textarea[data-testid='grok-input']",
    '[contenteditable="true"][aria-label*="message"]',
    "textarea",
  ],
  copilot: [
    'textarea[placeholder*="Message"]',
    '#userInput',
    '[contenteditable="true"]',
  ],
  mistral: [
    'textarea[placeholder*="Ask"]',
    '[contenteditable="true"]',
  ],
};

/**
 * Try each selector in priority order and return the first matching element.
 * Logs a named warning to the console if nothing resolves (signals staleness).
 */
export function resolveInputSelector(platform: Platform): Element | null {
  const strategies = INPUT_SELECTOR_STRATEGIES[platform];
  for (const selector of strategies) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  console.warn(
    `[GLIA resolver] No input selector resolved for "${platform}". ` +
    `The platform UI may have changed. Tried: ${strategies.join(", ")}`
  );
  return null;
}

/**
 * Try all selectors and return all matching elements.
 * Filters out ancestor/descendant duplicates to keep only the most specific elements.
 */
export function resolveAll(selectors: string[]): Element[] {
  const seen = new Set<Element>();
  const results: Element[] = [];
  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      for (const el of Array.from(nodes)) {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      }
    } catch {
      // Invalid selector — skip silently
    }
  }
  
  // Remove ancestor/descendant duplicates — keep the most specific (deepest) element.
  return results.filter(el =>
    !results.some(other => other !== el && other.contains(el))
  );
}

/**
 * Watch for DOM changes and call `cb` when a valid input element appears.
 * Automatically disconnects after the first successful resolution.
 * Useful after SPA navigation events where the input renders asynchronously.
 */
export function watchForInput(
  platform: Platform,
  cb: (el: Element) => void,
  timeoutMs = 10_000
): MutationObserver {
  const observer = new MutationObserver(() => {
    const el = resolveInputSelector(platform);
    if (el) {
      cb(el);
      observer.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Auto-disconnect after timeout to prevent memory leaks
  setTimeout(() => observer.disconnect(), timeoutMs);

  return observer;
}
