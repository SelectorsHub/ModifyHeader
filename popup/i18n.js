/**
 * i18n.js — Modify Header localisation helper
 *
 * Uses Chrome's built-in extension i18n (chrome.i18n + _locales/), which
 * automatically picks the browser's UI language and falls back to
 * "default_locale" (en) for anything missing. No language picker needed.
 *
 * Static markup is translated through data attributes:
 *   data-i18n="key"              → textContent
 *   data-i18n-html="key"         → innerHTML (only our own message strings)
 *   data-i18n-placeholder="key"  → placeholder
 *   data-i18n-title="key"        → title
 *   data-i18n-tooltip="key"      → data-tooltip
 *   data-i18n-aria-label="key"   → aria-label
 */

/**
 * Translate a message key. Extra args fill $1, $2, … in the message.
 * Falls back to the key itself so a missing string is visible, not blank.
 */
function t(key, ...subs) {
  try {
    const msg = chrome.i18n.getMessage(key, subs.map(String));
    return msg || key;
  } catch (e) {
    return key;
  }
}

const I18N_ATTRS = [
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-title', 'title'],
  ['data-i18n-tooltip', 'data-tooltip'],
  ['data-i18n-aria-label', 'aria-label'],
];

function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  I18N_ATTRS.forEach(([dataAttr, target]) => {
    root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
      el.setAttribute(target, t(el.getAttribute(dataAttr)));
    });
  });
}

(function initI18n() {
  try {
    const uiLang = chrome.i18n.getUILanguage();          // e.g. "zh-CN", "ja"
    document.documentElement.lang = uiLang;
    document.documentElement.setAttribute('data-lang', uiLang.split('-')[0].toLowerCase());
    document.title = t('appName');
  } catch (e) { /* non-extension context */ }
  applyI18n();
})();
