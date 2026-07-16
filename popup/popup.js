/**
 * popup.js — ModifyHeaders Pro
 *
 * Manages rule CRUD via chrome.storage.local and syncs to the
 * background service worker which interfaces with declarativeNetRequest.
 *
 * No inline event handlers. No .then() chains — async/await throughout.
 */

/* ================================================================
   Utility helpers
   ================================================================ */

/**
 * Show a toast notification.
 * @param {string} msg  - The message text.
 * @param {'success'|'error'} type - Visual style.
 */
function showToast(msg, type = 'success') {
  const $toast = $('#app-toast');
  $toast
    .removeClass('toast-success toast-error bg-success bg-danger')
    .addClass(type === 'success' ? 'toast-success' : 'toast-error');

  $('#toast-message').html(
    type === 'success'
      ? `<i class="bi bi-check-circle-fill text-success me-2"></i>${msg}`
      : `<i class="bi bi-x-circle-fill text-danger me-2"></i>${msg}`
  );

  const toast = bootstrap.Toast.getOrCreateInstance($toast[0], { delay: 2800 });
  toast.show();
}

/** Generate a unique ID for a rule. */
function generateId() {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ================================================================
   Power (global on/off) helpers
   ================================================================ */

/**
 * Apply the enabled/disabled visual state to the popup UI.
 * @param {boolean} enabled
 */
function applyPowerState(enabled) {
  const $btn   = $('#btn-power');
  const $label = $('#power-label');
  const $banner = $('#disabled-banner');

  if (enabled) {
    $btn.removeClass('power-off');
    $label.text('ON').removeClass('off');
    $banner.addClass('d-none');
    $('body').removeClass('ext-disabled');
  } else {
    $btn.addClass('power-off');
    $label.text('OFF').addClass('off');
    $banner.removeClass('d-none');
    $('body').addClass('ext-disabled');
  }
}

/**
 * Apply the color theme to the popup.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  const isLight = theme === 'light';
  $('body').toggleClass('theme-light', isLight);

  const $icon = $('#btn-theme i');
  $icon.removeClass('bi-moon-stars-fill bi-sun-fill')
       .addClass(isLight ? 'bi-sun-fill' : 'bi-moon-stars-fill');
  $('#btn-theme').attr('data-tooltip', isLight ? 'Switch to dark theme' : 'Switch to light theme');
}

/* ================================================================
   Storage helpers
   ================================================================ */

/** Load all rules from chrome.storage.local. */
async function loadRules() {
  const { headerRules = [] } = await chrome.storage.local.get('headerRules');
  return headerRules;
}

/** Persist rules array to chrome.storage.local. */
async function saveRules(rules) {
  await chrome.storage.local.set({ headerRules: rules });
}

/** Tell the background SW to re-sync rules with declarativeNetRequest. */
async function syncWithBackground() {
  try {
    await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  } catch (err) {
    console.warn('[ModifyHeaders] Background sync warning:', err.message);
  }
}

/* ================================================================
   Badge mapping helpers
   ================================================================ */

function typeBadge(type) {
  const icon = type === 'request' ? 'bi-arrow-up-circle' : 'bi-arrow-down-circle';
  return `<span class="badge-type badge-${type}">
            <i class="bi ${icon}"></i>${type}
          </span>`;
}

function actionBadge(action) {
  const map = {
    set:    { icon: 'bi-pencil-fill',  label: 'Modify' },
    append: { icon: 'bi-plus-circle',  label: 'Add' },
    remove: { icon: 'bi-dash-circle',  label: 'Remove' },
  };
  const { icon, label } = map[action] || { icon: 'bi-question', label: action };
  return `<span class="badge-action badge-${action}">
            <i class="bi ${icon}"></i>${label}
          </span>`;
}

/* ================================================================
   Render
   ================================================================ */

/**
 * Build and inject the table rows from a rules array.
 * Also updates the header count badges.
 *
 * @param {Array} rules - Array of rule objects from storage.
 * @param {string} search - Optional search filter string.
 * @param {string} typeFilter - Optional type filter ('request'|'response'|'').
 */
function renderRules(rules, search = '', typeFilter = '') {
  let filtered = rules;

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.domain.toLowerCase().includes(q) ||
        r.headerName.toLowerCase().includes(q) ||
        r.headerValue.toLowerCase().includes(q)
    );
  }

  if (typeFilter) {
    filtered = filtered.filter((r) => r.type === typeFilter);
  }

  const $tbody = $('#rules-tbody');
  $tbody.empty();

  // Update count badges
  const activeCount = rules.filter((r) => r.active).length;
  $('#active-count').text(activeCount);
  $('#total-count').text(rules.length);

  if (rules.length === 0) {
    $('#empty-state').removeClass('d-none');
    $('#rules-wrapper').addClass('d-none');
    return;
  }

  $('#empty-state').addClass('d-none');
  $('#rules-wrapper').removeClass('d-none');

  if (filtered.length === 0) {
    $tbody.html(`
      <tr>
        <td colspan="7" class="text-center py-4" style="color:var(--text-muted);">
          <i class="bi bi-search me-2"></i>No rules match your search.
        </td>
      </tr>
    `);
    return;
  }

  filtered.forEach((rule) => {
    const domainDisplay = rule.domain || '<span style="color:var(--text-muted);font-style:italic;">All URLs</span>';
    const valueDisplay  = rule.headerValue || '<span style="color:var(--text-muted);">—</span>';

    const rowClass = rule.active ? 'rule-row' : 'rule-row inactive-row';

    const $row = $(`
      <tr class="${rowClass}" data-id="${rule.id}">
        <td>
          <div class="form-check form-switch mb-0 d-flex justify-content-center">
            <input
              type="checkbox"
              class="form-check-input toggle-switch toggle-active"
              ${rule.active ? 'checked' : ''}
              aria-label="Toggle rule active status"
            />
          </div>
        </td>
        <td class="cell-domain-td" data-tooltip="${rule.domain || 'All URLs'}">
          <span class="cell-domain">${domainDisplay}</span>
        </td>
        <td class="cell-header-td" data-tooltip="${rule.headerName}">
          <span class="cell-header-name">${rule.headerName}</span>
        </td>
        <td class="cell-value-td" data-tooltip="${rule.headerValue || '—'}">
          <span class="cell-value">${valueDisplay}</span>
        </td>
        <td>${typeBadge(rule.type)}</td>
        <td>${actionBadge(rule.action)}</td>
        <td class="text-end">
          <button class="btn-icon btn-edit" title="Edit rule" data-id="${rule.id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn-icon btn-delete" title="Delete rule" data-id="${rule.id}">
            <i class="bi bi-trash3"></i>
          </button>
        </td>
      </tr>
    `);

    $tbody.append($row);
  });
}

/* ================================================================
   State: pending delete rule ID & pending edit rule ID
   ================================================================ */
let pendingDeleteId = null;
let pendingEditId   = null;

/* ================================================================
   Modal mode helper (Add vs Edit)
   ================================================================ */

/**
 * Switch the shared modal between "Add" and "Edit" appearance.
 * @param {'add'|'edit'} mode
 */
function setModalMode(mode) {
  if (mode === 'edit') {
    $('#modal-title-icon').attr('class', 'bi bi-pencil-square text-warning me-2');
    $('#modal-title-text').text('Edit Rule');
    $('#modal-subtitle').text('Update the fields below and save your changes.');
    $('#save-btn-icon').attr('class', 'bi bi-floppy me-1');
    $('#save-btn-text').text('Update Rule');
  } else {
    $('#modal-title-icon').attr('class', 'bi bi-plus-circle-fill text-primary me-2');
    $('#modal-title-text').text('Add New Rule');
    $('#modal-subtitle').text('Define a header modification rule below.');
    $('#save-btn-icon').attr('class', 'bi bi-check2 me-1');
    $('#save-btn-text').text('Save Rule');
  }
}

/* ================================================================
   Event: Edit button → open modal pre-filled
   ================================================================ */

$(document).on('click', '.btn-edit', async function () {
  const id = $(this).data('id');
  const rules = await loadRules();
  const rule = rules.find((r) => r.id === id);
  if (!rule) return;

  pendingEditId = id;

  // Pre-fill form fields
  $('#input-domain').val(rule.domain);
  $('#input-header-name').val(rule.headerName);
  $('#input-header-value').val(rule.headerValue);
  $('#input-type').val(rule.type);
  $('#input-action').val(rule.action);
  $('#input-active').prop('checked', rule.active).trigger('change');

  // Switch modal to edit mode
  setModalMode('edit');

  // Open the shared modal
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addRuleModal'));
  modal.show();
});



$(document).on('change', '.toggle-active', async function () {
  const $row = $(this).closest('tr');
  const id = $row.data('id');
  const isActive = $(this).is(':checked');

  const rules = await loadRules();
  const rule = rules.find((r) => r.id === id);
  if (!rule) return;

  rule.active = isActive;
  await saveRules(rules);
  await syncWithBackground();

  // Update row dim class
  $row.toggleClass('inactive-row', !isActive);

  // Update active count badge
  const activeCount = rules.filter((r) => r.active).length;
  $('#active-count').text(activeCount);

  showToast(`Rule ${isActive ? 'activated' : 'deactivated'} and synced.`);
});

/* ================================================================
   Event: Delete button → open confirm modal
   ================================================================ */

$(document).on('click', '.btn-delete', function () {
  pendingDeleteId = $(this).data('id');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteModal'));
  modal.show();
});

/* ================================================================
   Event: Confirm delete
   ================================================================ */

$('#btn-confirm-delete').on('click', async function () {
  if (!pendingDeleteId) return;

  const modal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
  modal.hide();

  const rules = await loadRules();
  const updated = rules.filter((r) => r.id !== pendingDeleteId);
  await saveRules(updated);
  await syncWithBackground();

  pendingDeleteId = null;
  renderRules(updated, $('#search-input').val(), $('#filter-type').val());
  showToast('Rule deleted and engine synced.');
});

/* ================================================================
   Event: Toggle status label in Add Rule modal
   ================================================================ */

$('#input-active').on('change', function () {
  const isActive = $(this).is(':checked');
  const $label = $('#status-label');
  $label
    .text(isActive ? 'Active' : 'Inactive')
    .removeClass('active inactive')
    .addClass(isActive ? 'active' : 'inactive');
});

/* ================================================================
   Event: Save new rule
   ================================================================ */

$('#btn-save-rule').on('click', async function () {
  // Clear previous errors
  $('#form-error').addClass('d-none');
  $('#add-rule-form .field-input').removeClass('is-invalid');

  const domain      = $('#input-domain').val().trim();
  const headerName  = $('#input-header-name').val().trim();
  const headerValue = $('#input-header-value').val().trim();
  const type        = $('#input-type').val();
  const action      = $('#input-action').val();
  const active      = $('#input-active').is(':checked');

  // Validate: header name is required
  if (!headerName) {
    $('#input-header-name').addClass('is-invalid');
    showFormError('Header Name is required.');
    return;
  }

  // Validate: value is required unless action = remove
  if (action !== 'remove' && !headerValue) {
    $('#input-header-value').addClass('is-invalid');
    showFormError('Header Value is required for Add/Modify actions.');
    return;
  }

  // Validate regex pattern (if domain provided)
  if (domain) {
    try {
      new RegExp(domain);
    } catch {
      $('#input-domain').addClass('is-invalid');
      showFormError('Invalid regex pattern in Domain field.');
      return;
    }
  }

  const rules = await loadRules();

  if (pendingEditId) {
    // ── EDIT MODE: update the existing rule in-place ──────────────
    const idx = rules.findIndex((r) => r.id === pendingEditId);
    if (idx !== -1) {
      rules[idx] = {
        ...rules[idx],   // preserve id & createdAt
        domain,
        headerName,
        headerValue,
        type,
        action,
        active,
        updatedAt: Date.now(),
      };
    }
    await saveRules(rules);
    await syncWithBackground();

    const modal = bootstrap.Modal.getInstance(document.getElementById('addRuleModal'));
    modal.hide();
    resetForm();

    renderRules(rules, $('#search-input').val(), $('#filter-type').val());
    showToast('Rule updated and engine synced!');
  } else {
    // ── ADD MODE: push a brand-new rule ───────────────────────────
    const newRule = {
      id: generateId(),
      domain,
      headerName,
      headerValue,
      type,
      action,
      active,
      createdAt: Date.now(),
    };

    rules.push(newRule);
    await saveRules(rules);
    await syncWithBackground();

    const modal = bootstrap.Modal.getInstance(document.getElementById('addRuleModal'));
    modal.hide();
    resetForm();

    renderRules(rules, $('#search-input').val(), $('#filter-type').val());
    showToast('Rule saved and engine synced!');
  }
});

function showFormError(msg) {
  $('#form-error-msg').text(msg);
  $('#form-error').removeClass('d-none');
}

function resetForm() {
  $('#add-rule-form')[0].reset();
  $('#form-error').addClass('d-none');
  $('#add-rule-form .is-invalid').removeClass('is-invalid');
  $('#input-active').prop('checked', true);
  $('#status-label').text('Active').removeClass('inactive').addClass('active');
  // Clear edit state and restore Add mode
  pendingEditId = null;
  setModalMode('add');
}

/* ================================================================
   Event: Reset form when modal is closed
   ================================================================ */

document.getElementById('addRuleModal').addEventListener('hidden.bs.modal', resetForm);

/* ================================================================
   Event: "Current Tab" button → fill domain from active tab URL
   ================================================================ */

/**
 * Build a regex URL pattern from the active tab's URL.
 * e.g. https://www.example.com/page → .*www\.example\.com.*
 * Internal chrome:// pages fall back to the raw URL.
 * @returns {Promise<string|null>} pattern, or null if no active tab URL.
 */
async function buildPatternFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;

  try {
    const url = new URL(tab.url);
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
      return tab.url;
    }
    const escapedHost = url.hostname.replace(/\./g, '\\.');
    return `.*${escapedHost}.*`;
  } catch {
    return tab.url;
  }
}

/** Fill a domain input with the active tab's pattern + flash confirm. */
async function fillDomainFromTab($input) {
  try {
    const pattern = await buildPatternFromActiveTab();
    if (pattern === null) return;
    $input.val(pattern).removeClass('is-invalid');
    $input.addClass('field-flash');
    setTimeout(() => $input.removeClass('field-flash'), 600);
  } catch (err) {
    console.warn('[ModifyHeaders] Could not read active tab:', err.message);
  }
}

$('#btn-pick-tab').on('click', function () {
  fillDomainFromTab($('#input-domain'));
});

/* ================================================================
   Event: Search & Filter
   ================================================================ */

let searchTimeout;
$('#search-input').on('input', function () {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const rules = await loadRules();
    renderRules(rules, $(this).val(), $('#filter-type').val());
  }, 250);
});

$('#filter-type').on('change', async function () {
  const rules = await loadRules();
  renderRules(rules, $('#search-input').val(), $(this).val());
});

/* ================================================================
   Event: Theme toggle
   ================================================================ */

$('#btn-theme').on('click', async function () {
  const { theme = 'light' } = await chrome.storage.local.get('theme');
  const newTheme = theme === 'light' ? 'dark' : 'light';

  await chrome.storage.local.set({ theme: newTheme });
  applyTheme(newTheme);
});

/* ================================================================
   Footer: Rate us & Share
   ================================================================ */

const STORE_URL  = 'https://chromewebstore.google.com/detail/modify-header/odpbebncejmlkaamjaoojkcfffbinlko';
const REVIEW_URL = STORE_URL + '/reviews';
const SHARE_TEXT = 'Modify Header — a clean browser extension to manage HTTP request & response header rules. Check it out:';

/** Open a URL in a new browser tab. */
function openTab(url) {
  if (chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Hide the Rate-us button permanently. */
function hideRateButton() {
  $('#btn-rate').addClass('d-none');
}

// Rate us — open reviews page, then disable the button forever.
$('#btn-rate').on('click', async function () {
  await chrome.storage.local.set({ rated: true });
  hideRateButton();
  openTab(REVIEW_URL);
});

// Social share links.
const SHARE_URLS = {
  twitter:  () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(STORE_URL)}`,
  linkedin: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(STORE_URL)}`,
  facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(STORE_URL)}`,
  whatsapp: () => `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + ' ' + STORE_URL)}`,
  reddit:   () => `https://www.reddit.com/submit?url=${encodeURIComponent(STORE_URL)}&title=${encodeURIComponent('Modify Header browser extension')}`,
  telegram: () => `https://t.me/share/url?url=${encodeURIComponent(STORE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`
};

$('.share-btn').on('click', function () {
  const platform = $(this).data('share');
  const build = SHARE_URLS[platform];
  if (build) openTab(build());
});

// Copy the store link to the clipboard.
$('#btn-copy-link').on('click', async function () {
  const $btn = $(this);
  try {
    await navigator.clipboard.writeText(STORE_URL);
  } catch (e) {
    const el = document.getElementById('share-link');
    el.select();
    document.execCommand('copy');
  }
  $btn.html('<i class="bi bi-clipboard-check me-1"></i>Copied');
  setTimeout(() => $btn.html('<i class="bi bi-clipboard me-1"></i>Copy'), 1600);
});

/* ================================================================
   Event: Global power toggle
   ================================================================ */

$('#btn-power').on('click', async function () {
  const { extensionEnabled = true } = await chrome.storage.local.get('extensionEnabled');
  const newState = !extensionEnabled;

  await chrome.storage.local.set({ extensionEnabled: newState });
  applyPowerState(newState);
  await syncWithBackground();

  showToast(
    newState ? 'Extension enabled — rules are active.' : 'Extension paused — all rules suspended.',
    newState ? 'success' : 'error'
  );
});

/* ================================================================
   Import: request-level header import
   ================================================================ */

// RFC 7230 header-name token: no spaces or separators allowed.
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Parse a block of raw request headers into {name, value} pairs.
 *
 * Tolerant of the formats developers actually paste — DevTools "raw"
 * blocks, .http files, curl -H lines. It skips:
 *   • blank lines
 *   • comment lines (# or //)
 *   • HTTP/2 pseudo-headers (:authority, :method, …)
 *   • the request/status line (no colon, or an invalid header name)
 *
 * Duplicate names within the block are collapsed (last one wins,
 * case-insensitive) so the preview count matches what gets created.
 *
 * @param {string} raw
 * @returns {Array<{name: string, value: string}>}
 */
function parseRequestHeaders(raw) {
  const seen = new Map(); // lowercased name → {name, value}

  (raw || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    if (trimmed.startsWith(':')) return; // pseudo-header

    // Drop an optional leading "-H " / "--header " from copied curl lines.
    const cleaned = trimmed.replace(/^(-H|--header)\s+/i, '').replace(/^['"]|['"]$/g, '');

    const idx = cleaned.indexOf(':');
    if (idx === -1) return; // request line / garbage

    const name = cleaned.slice(0, idx).trim();
    const value = cleaned.slice(idx + 1).trim();

    if (!name || !HEADER_NAME_RE.test(name)) return;

    seen.set(name.toLowerCase(), { name, value });
  });

  return [...seen.values()];
}

/** Live-update the header count chip as the user types/pastes. */
function updateImportCount() {
  const headers = parseRequestHeaders($('#import-textarea').val());
  const $chip = $('#import-count-chip');
  const n = headers.length;

  $chip
    .text(`${n} header${n === 1 ? '' : 's'}`)
    .removeClass('d-none')
    .toggleClass('chip-empty', n === 0);
}

$('#import-textarea').on('input', updateImportCount);

$('#btn-import-pick-tab').on('click', function () {
  fillDomainFromTab($('#import-domain'));
});

$('#import-active').on('change', function () {
  const isActive = $(this).is(':checked');
  $('#import-status-label')
    .text(isActive ? 'Active' : 'Inactive')
    .removeClass('active inactive')
    .addClass(isActive ? 'active' : 'inactive');
});

function showImportError(msg) {
  $('#import-error-msg').text(msg);
  $('#import-error').removeClass('d-none');
}

function resetImportForm() {
  $('#import-form')[0].reset();
  $('#import-error').addClass('d-none');
  $('#import-domain').removeClass('is-invalid');
  $('#import-count-chip').addClass('d-none');
  $('#import-active').prop('checked', true);
  $('#import-status-label').text('Active').removeClass('inactive').addClass('active');
}

document.getElementById('importModal').addEventListener('hidden.bs.modal', resetImportForm);

$('#btn-run-import').on('click', async function () {
  $('#import-error').addClass('d-none');
  $('#import-domain').removeClass('is-invalid');

  const headers = parseRequestHeaders($('#import-textarea').val());
  const domain  = $('#import-domain').val().trim();
  const action  = $('#import-action').val();
  const active  = $('#import-active').is(':checked');

  if (headers.length === 0) {
    showImportError('No valid headers found. Use one “Header-Name: value” per line.');
    return;
  }

  // Validate the domain regex (same rule as the Add form).
  if (domain) {
    try {
      new RegExp(domain);
    } catch {
      $('#import-domain').addClass('is-invalid');
      showImportError('Invalid regex pattern in Domain field.');
      return;
    }
  }

  const rules = await loadRules();
  let added = 0;
  let updated = 0;

  headers.forEach(({ name, value }) => {
    // Merge, don't duplicate: same request header + same domain updates in place.
    const idx = rules.findIndex(
      (r) =>
        r.type === 'request' &&
        (r.domain || '') === domain &&
        r.headerName.toLowerCase() === name.toLowerCase()
    );

    if (idx !== -1) {
      rules[idx] = {
        ...rules[idx],
        headerValue: value,
        action,
        active,
        updatedAt: Date.now(),
      };
      updated++;
    } else {
      rules.push({
        id: generateId(),
        domain,
        headerName: name,
        headerValue: value,
        type: 'request',
        action,
        active,
        createdAt: Date.now(),
      });
      added++;
    }
  });

  await saveRules(rules);
  await syncWithBackground();

  const modal = bootstrap.Modal.getInstance(document.getElementById('importModal'));
  modal.hide();

  renderRules(rules, $('#search-input').val(), $('#filter-type').val());

  const parts = [];
  if (added) parts.push(`${added} new`);
  if (updated) parts.push(`${updated} updated`);
  showToast(`Imported ${headers.length} request header${headers.length === 1 ? '' : 's'} (${parts.join(', ')}).`);
});

/* ================================================================
   Init: load and render on popup open
   ================================================================ */

$(async function () {
  // Restore color theme
  const { theme = 'light' } = await chrome.storage.local.get('theme');
  applyTheme(theme);

  // Hide Rate-us permanently if the user has already reviewed.
  const { rated = false } = await chrome.storage.local.get('rated');
  if (rated) hideRateButton();

  // Restore power state
  const { extensionEnabled = true } = await chrome.storage.local.get('extensionEnabled');
  applyPowerState(extensionEnabled);

  // Render rules table
  const rules = await loadRules();
  renderRules(rules);
});
