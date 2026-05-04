#!/usr/bin/env node
/**
 * scripts/check-selectors.js
 *
 * Playwright smoke test that verifies CSS selectors still resolve on each
 * supported AI platform. Runs headlessly — no login needed to check that
 * the input box and response container exist on the page.
 *
 * Called by .github/workflows/selector-check.yml every Monday at 09:00 UTC.
 * Exit 1 triggers the workflow to auto-create a GitHub issue.
 *
 * Run manually:
 *   npx playwright install chromium --with-deps
 *   node scripts/check-selectors.js
 *
 * Exit codes:
 *   0 - all selectors found on all platforms
 *   1 - one or more selectors broken
 */

const { chromium } = require("playwright");

// Mirrors INPUT_SELECTOR_STRATEGIES in extension/src/platform/resolver.ts
// and the user/response selectors in each platform file.
// Keep these in sync when you update resolver.ts or a platform file.
const PLATFORMS = [
  {
    name: "Claude",
    url: "https://claude.ai/new",
    inputSelectors: [
      'div.ProseMirror',
      '[data-placeholder][contenteditable]',
      '[data-testid="composer-input"]',
      '[aria-label="Message Claude"][contenteditable]',
      'div[role="textbox"][contenteditable]',
      '[contenteditable="true"]',
    ],
    responseSelectors: [
      '.font-claude-response',
      '.font-claude-message',
      '[data-is-streaming]',
    ],
  },
  {
    name: "ChatGPT",
    url: "https://chatgpt.com",
    inputSelectors: [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'div[placeholder*="Message"][contenteditable]',
      '[contenteditable="true"]',
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      '.markdown.prose',
      '.agent-turn',
    ],
  },
  {
    name: "Gemini",
    url: "https://gemini.google.com",
    inputSelectors: [
      '.ql-editor',
      'rich-textarea [contenteditable="true"]',
      '[aria-label*="message"][contenteditable]',
      'div[role="textbox"][contenteditable]',
      '[contenteditable="true"]',
    ],
    responseSelectors: [
      'model-response',
      '.response-content',
      '.model-response-text',
    ],
  },
  {
    name: "Perplexity",
    url: "https://www.perplexity.ai",
    inputSelectors: [
      'textarea[placeholder*="Ask"]',
      '#ask-input',
      'textarea[data-testid="search-input"]',
      'textarea[aria-label*="Ask"]',
      'textarea',
    ],
    responseSelectors: [
      '[data-testid="answer"]',
      '.answer-content',
      '.prose',
    ],
  },
  {
    name: "DeepSeek",
    url: "https://chat.deepseek.com",
    inputSelectors: [
      '#chat-input',
      'textarea[placeholder*="Send a message"]',
      'textarea[data-testid="chat-input"]',
      'textarea',
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      '.ds-markdown',
      '.prose',
    ],
  },
];

async function checkPlatform(browser, platform) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });
  const page = await context.newPage();
  const results = { name: platform.name, passed: [], failed: [] };

  try {
    await page.goto(platform.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(4000); // let React/Angular hydrate

    // Input: at least one strategy must match
    let inputFound = false;
    for (const sel of platform.inputSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) { inputFound = true; break; }
      } catch { /* invalid selector — skip */ }
    }
    if (inputFound) {
      results.passed.push(`  OK  input: resolved`);
    } else {
      results.failed.push(`  FAIL input: no strategy matched — ${platform.inputSelectors.join(", ")}`);
    }

    // Responses: checked but non-fatal on empty pages (no conversation loaded)
    let responseFound = false;
    for (const sel of platform.responseSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) { responseFound = true; break; }
      } catch { /* skip */ }
    }
    if (responseFound) {
      results.passed.push(`  OK  response: resolved`);
    } else {
      // Non-fatal — new chat pages have no response elements yet
      results.passed.push(`  --  response: not found (expected on empty page)`);
    }

  } catch (err) {
    results.failed.push(`  FAIL page load: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

(async () => {
  console.log("\nSYNQ Platform Selector Smoke Test\n");
  const browser = await chromium.launch({ headless: true });
  let totalFailed = 0;

  for (const platform of PLATFORMS) {
    console.log(`Checking ${platform.name} (${platform.url})...`);
    const result = await checkPlatform(browser, platform);
    result.passed.forEach((m) => console.log(m));
    result.failed.forEach((m) => console.log(m));
    totalFailed += result.failed.length;
    console.log();
  }

  await browser.close();

  if (totalFailed === 0) {
    console.log("All selectors OK\n");
    process.exit(0);
  } else {
    console.log(`${totalFailed} selector(s) broken. Update extension/src/platform/resolver.ts`);
    console.log("Reference: PLATFORM_SELECTORS.md\n");
    process.exit(1);
  }
})();
