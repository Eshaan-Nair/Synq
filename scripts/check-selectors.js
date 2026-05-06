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
const path = require("path");
const fs = require("fs");

const PLATFORMS = [
  {
    name: "Claude",
    url: "https://claude.ai/new",
    fixture: "claude.html",
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
    fixture: "chatgpt.html",
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
    fixture: "gemini.html",
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
    name: "DeepSeek",
    url: "https://chat.deepseek.com",
    fixture: "deepseek.html",
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

async function checkPlatform(browser, platform, useFixtures = false) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });
  const page = await context.newPage();
  const results = { name: platform.name, passed: [], failed: [] };

  try {
    if (useFixtures) {
      const fixturePath = path.resolve(__dirname, "fixtures", platform.fixture);
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture not found: ${fixturePath}`);
      }
      await page.goto(`file://${fixturePath}`);
    } else {
      await page.goto(platform.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(4000); 
    }

    // Input Check
    let inputFound = false;
    for (const sel of platform.inputSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) { 
        inputFound = true; 
        results.passed.push(`  OK  input: resolved via "${sel}"`);
        break; 
      }
    }
    if (!inputFound) {
      results.failed.push(`  FAIL input: no strategy matched`);
    }

    // Response Check (verify it actually has text in fixture mode)
    let responseFound = false;
    for (const sel of platform.responseSelectors) {
      const locator = page.locator(sel);
      const count = await locator.count();
      if (count > 0) {
        if (useFixtures) {
          const text = await locator.first().textContent();
          if (text && text.trim().length > 5) {
            responseFound = true;
            results.passed.push(`  OK  response: resolved + contains content`);
            break;
          }
        } else {
          responseFound = true;
          results.passed.push(`  OK  response: resolved`);
          break;
        }
      }
    }

    if (!responseFound && useFixtures) {
      results.failed.push(`  FAIL response: not found or empty in fixture`);
    } else if (!responseFound) {
      results.passed.push(`  --  response: not found (expected on empty page)`);
    }

  } catch (err) {
    results.failed.push(`  FAIL: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

(async () => {
  const useFixtures = process.argv.includes("--fixtures");
  console.log(`\nSYNQ Platform Selector Smoke Test ${useFixtures ? "(FIXTURE MODE)" : "(LIVE MODE)"}\n`);
  
  const browser = await chromium.launch({ headless: true });
  let totalFailed = 0;

  for (const platform of PLATFORMS) {
    process.stdout.write(`Checking ${platform.name}... `);
    const result = await checkPlatform(browser, platform, useFixtures);
    
    if (result.failed.length === 0) {
      console.log("✅");
    } else {
      console.log("❌");
    }
    
    result.passed.forEach((m) => console.log(m));
    result.failed.forEach((m) => console.log(m));
    totalFailed += result.failed.length;
    console.log();
  }

  await browser.close();

  if (totalFailed === 0) {
    console.log("All checks passed\n");
    process.exit(0);
  } else {
    console.log(`${totalFailed} check(s) failed.\n`);
    process.exit(1);
  }
})();
