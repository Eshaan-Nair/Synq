#!/usr/bin/env node
/**
 * scripts/check-selectors.js
 *
 * Playwright smoke test — verifies CSS selectors still resolve on every
 * supported AI platform. Runs headlessly; no login required.
 *
 * Called by .github/workflows/selector-check.yml every Monday at 09:00 UTC.
 * On failure, writes selector-failures.json to the repo root so the workflow
 * can embed the exact failing platforms and reasons into the GitHub Issue body.
 *
 * Run manually:
 *   npx playwright install chromium --with-deps
 *   node scripts/check-selectors.js
 *
 * Exit codes:
 *   0  all selectors resolved on all platforms
 *   1  one or more selectors broken
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
  {
    name: "Grok",
    url: "https://x.com/i/grok",
    fixture: "grok.html",
    inputSelectors: [
      "textarea[placeholder*='Ask']",
      "textarea[data-testid='grok-input']",
      "textarea[data-testid='tweetTextarea_0']",
      '[contenteditable="true"][aria-label*="message"]',
      "textarea",
    ],
    responseSelectors: [
      '[data-testid="grok-response"]',
      ".grok-response",
      "[class*='response']",
    ],
  },
  {
    name: "Copilot",
    url: "https://copilot.microsoft.com",
    fixture: "copilot.html",
    inputSelectors: [
      'textarea#userInput',
      'textarea[data-testid="composer-input"]',
      'textarea[placeholder*="Message"]',
      '#userInput',
      '[contenteditable="true"]',
    ],
    responseSelectors: [
      '[data-content="assistant"]',
      '.bot-turn',
      '[data-testid="response-message"]',
      '.ac-textBlock',
      '[class*="message-body"]',
    ],
  },
  {
    name: "Mistral",
    url: "https://chat.mistral.ai",
    fixture: "mistral.html",
    inputSelectors: [
      'div.ProseMirror',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="message"]',
      '[contenteditable="true"]',
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      '.assistant-message',
      '[data-role="assistant"]',
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

    // Input check — try each strategy, stop at first match
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
      results.failed.push(`input selector: no strategy matched (tried ${platform.inputSelectors.length} selectors)`);
    }

    // Response check
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
      results.failed.push(`response selector: not found or empty in fixture`);
    } else if (!responseFound) {
      // On a live empty page this is expected — not a failure
      results.passed.push(`  --  response: not found (expected on empty page)`);
    }

  } catch (err) {
    results.failed.push(`exception: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

(async () => {
  const useFixtures = process.argv.includes("--fixtures");
  console.log(`\nArcRift Platform Selector Smoke Test ${useFixtures ? "(FIXTURE MODE)" : "(LIVE MODE)"}\n`);
  console.log(`Platforms checked: ${PLATFORMS.map(p => p.name).join(", ")}\n`);

  const browser = await chromium.launch({ headless: true });
  let totalFailed = 0;
  const failedPlatforms = [];
  const failureDetails = {};

  for (const platform of PLATFORMS) {
    process.stdout.write(`Checking ${platform.name}... `);
    const result = await checkPlatform(browser, platform, useFixtures);

    if (result.failed.length === 0) {
      console.log("OK");
    } else {
      console.log("FAILED");
      failedPlatforms.push(platform.name);
      failureDetails[platform.name] = result.failed;
    }

    result.passed.forEach((m) => console.log(m));
    result.failed.forEach((m) => console.log(`  FAIL  ${m}`));
    totalFailed += result.failed.length;
    console.log();
  }

  await browser.close();

  if (totalFailed > 0) {
    // Write structured report so the CI workflow can embed exact details in the GitHub Issue
    const report = {
      failedPlatforms,
      failureDetails,
      totalFailed,
      timestamp: new Date().toISOString(),
    };
    const reportPath = path.resolve(__dirname, "..", "selector-failures.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`${totalFailed} check(s) failed.`);
    console.log(`Failed platforms: ${failedPlatforms.join(", ")}`);
    console.log(`Failure report written to: selector-failures.json\n`);
    process.exit(1);
  } else {
    console.log("All checks passed\n");
    process.exit(0);
  }
})();
