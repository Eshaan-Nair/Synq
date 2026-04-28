#!/usr/bin/env node
/**
 * #10: Platform selector smoke test
 *
 * Verifies that the CSS selectors defined in content.ts still match elements
 * on the live platform pages. Run this periodically or before a release.
 *
 * Usage:
 *   node scripts/check-selectors.js
 *
 * Requirements:
 *   npm install -g playwright
 *   npx playwright install chromium
 *
 * Exit codes:
 *   0 — all selectors found on all platforms
 *   1 — one or more selectors are broken (platforms updated their DOM)
 */

const { chromium } = require("playwright");

// Mirror of the selectors in extension/src/content.ts
// Update these when you update content.ts
const PLATFORMS = [
  {
    name: "Claude",
    url: "https://claude.ai/new",
    selectors: {
      input:    '[contenteditable="true"]',
      response: ".font-claude-message, [data-test-render-count], .prose",
    },
  },
  {
    name: "ChatGPT",
    url: "https://chatgpt.com",
    selectors: {
      input:    "#prompt-textarea, [contenteditable='true']",
      response: '[data-message-author-role="assistant"], .markdown',
    },
  },
  {
    name: "Gemini",
    url: "https://gemini.google.com",
    selectors: {
      input:    ".ql-editor, [contenteditable='true']",
      response: "model-response, .model-response-text",
    },
  },
];

async function checkPlatform(browser, platform) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();
  const results = { name: platform.name, passed: [], failed: [] };

  try {
    await page.goto(platform.url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000); // let React/Angular hydrate

    for (const [role, selector] of Object.entries(platform.selectors)) {
      // Try each comma-separated fallback selector
      const candidates = selector.split(",").map((s) => s.trim());
      let found = false;
      for (const s of candidates) {
        const count = await page.locator(s).count();
        if (count > 0) { found = true; break; }
      }
      if (found) {
        results.passed.push(`  ✅ ${role}: ${selector}`);
      } else {
        results.failed.push(`  ❌ ${role}: ${selector} — NOT FOUND`);
      }
    }
  } catch (err) {
    results.failed.push(`  ❌ Page load failed: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

(async () => {
  console.log("\n🔍 SYNQ Platform Selector Smoke Test\n");
  const browser = await chromium.launch({ headless: true });
  let totalFailed = 0;

  for (const platform of PLATFORMS) {
    console.log(`📡 Checking ${platform.name} (${platform.url})...`);
    const result = await checkPlatform(browser, platform);
    result.passed.forEach((m) => console.log(m));
    result.failed.forEach((m) => console.log(m));
    totalFailed += result.failed.length;
    console.log();
  }

  await browser.close();

  if (totalFailed === 0) {
    console.log("✅ All selectors OK — no platform DOM changes detected.\n");
    process.exit(0);
  } else {
    console.log(`❌ ${totalFailed} selector(s) broken. Update extension/src/content.ts.`);
    console.log("   Reference: PLATFORM_SELECTORS.md\n");
    process.exit(1);
  }
})();
