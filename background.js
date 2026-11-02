/**
 * background.js — Service Worker for ModifyHeaders Pro
 *
 * Listens for messages from the popup and syncs rules with
 * chrome.declarativeNetRequest.updateDynamicRules().
 *
 * IMPORTANT: Service workers are ephemeral. All state lives in chrome.storage.
 */

/**
 * Converts a user-defined rule object from storage into a
 * declarativeNetRequest rule object.
 *
 * @param {Object} rule - The rule stored in chrome.storage.local
 * @param {number} dnrId - A unique integer ID for the DNR API
 * @returns {Object|null} A valid DNR rule, or null if conversion fails
 */
function buildDNRRule(rule, dnrId) {
  const actionObj = { type: 'modifyHeaders' };

  const headerEntry = {
    header: rule.headerName,
    operation: rule.action, // 'append' | 'set' | 'remove'
    value: rule.action !== 'remove' ? rule.headerValue : undefined,
  };

  // Remove undefined value key for 'remove' operations
  if (headerEntry.value === undefined) {
    delete headerEntry.value;
  }

  if (rule.type === 'request') {
    actionObj.requestHeaders = [headerEntry];
  } else {
    actionObj.responseHeaders = [headerEntry];
  }

  const dnrRule = {
    id: dnrId,
    priority: 1,
    action: actionObj,
    condition: {
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'stylesheet',
        'script',
        'image',
        'font',
        'object',
        'xmlhttprequest',
        'ping',
        'media',
        'websocket',
        'other',
      ],
    },
  };

  // Use regexFilter if the domain looks like a regex, otherwise urlFilter
  if (rule.domain && rule.domain.trim() !== '') {
    // Treat domain as a regex pattern
    dnrRule.condition.regexFilter = rule.domain;
  }

  return dnrRule;
}

/**
 * Reads all rules from chrome.storage.local, filters for active ones,
 * converts them, then clears + reloads all dynamic rules.
 *
 * If `extensionEnabled` is false in storage, ALL rules are removed from
 * the engine (paused state) without deleting them from storage.
 */
async function syncRulesWithDNR() {
  try {
    const { headerRules = [], extensionEnabled = true } = await chrome.storage.local.get([
      'headerRules',
      'extensionEnabled',
    ]);

    // Get currently registered dynamic rules to know which IDs to remove
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules.map((r) => r.id);

    // If the extension is paused, clear all rules and stop
    if (!extensionEnabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
      console.log('[ModifyHeaders] Extension paused — all rules removed from engine.');
      return;
    }

    // Only sync active rules
    const activeRules = headerRules.filter((r) => r.active);

    const addRules = [];
    for (let i = 0; i < activeRules.length; i++) {
      try {
        const dnrRule = buildDNRRule(activeRules[i], i + 1);
        if (dnrRule) {
          addRules.push(dnrRule);
        }
      } catch (ruleErr) {
        console.warn(`[ModifyHeaders] Skipping rule "${activeRules[i].headerName}":`, ruleErr.message);
      }
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });

    console.log(`[ModifyHeaders] Synced ${addRules.length} active rule(s).`);
  } catch (err) {
    console.error('[ModifyHeaders] Failed to sync rules:', err);
  }
}

// ─── Message Handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SYNC_RULES') {
    (async () => {
      await syncRulesWithDNR();
      sendResponse({ success: true });
    })();
    return true; // Keep the message channel open for async response
  }
});

// ─── Startup Sync ─────────────────────────────────────────────────────────────

// Re-apply rules when the service worker starts (e.g., after browser restart)
chrome.runtime.onStartup.addListener(async () => {
  await syncRulesWithDNR();
});

const INSTALLED_PAGE_URL = 'https://www.selectorshub.com/modify-header-installed/';

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncRulesWithDNR();

  // Show the welcome page on a fresh install only — not on updates,
  // browser updates, or when the extension is reloaded in dev mode.
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    try {
      await chrome.tabs.create({ url: INSTALLED_PAGE_URL });
    } catch (err) {
      console.warn('[ModifyHeaders] Could not open installed page:', err && err.message);
    }
  }
});
