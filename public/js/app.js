(function () {
  const KEY_STORAGE = 'truefind_api_key';
  const form = document.getElementById('lookupForm');
  const numberEl = document.getElementById('number');
  const searchBtn = document.getElementById('search');
  const statusEl = document.getElementById('status');
  const resultCard = document.getElementById('resultCard');
  const modalOverlay = document.getElementById('keyModal');
  const modal = modalOverlay.querySelector('.modal');
  const modalInput = document.getElementById('modalKey');
  const modalError = document.getElementById('modalError');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');
  const modalClose = document.getElementById('modalClose');
  const forgetKey = document.getElementById('forgetKey');
  const manageKey = document.getElementById('manageKey');
  const keyButtonLabel = document.getElementById('keyButtonLabel');
  let returnFocusTo = null;

  function getKey() {
    try {
      return localStorage.getItem(KEY_STORAGE) || '';
    } catch {
      return '';
    }
  }

  function setKey(value) {
    try {
      if (value) localStorage.setItem(KEY_STORAGE, value);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      modalError.textContent = 'This browser could not save your key. Check your browser storage settings.';
      return false;
    }
    return true;
  }

  function syncKeyButton() {
    keyButtonLabel.textContent = getKey() ? 'Manage API key' : 'Add API key';
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function setStatus(text, type) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function avatarHtml(record) {
    const fallback = `<div class="avatar-fallback">${escapeHtml(initials(record.name))}</div>`;
    const image = safeImageUrl(record.profileImage);
    return `
      <div class="avatar-wrap">
        ${image ? `<img class="avatar" src="${escapeHtml(image)}" alt="" referrerpolicy="no-referrer">${fallback}` : fallback}
      </div>`;
  }

  function renderSuccess(data) {
    const record = data.records[0] || {};
    const mobile = data.number || record.mobile || '';
    resultCard.innerHTML = `
      <div class="profile">
        ${avatarHtml(record)}
        <h3 class="name">${escapeHtml(record.name || 'Unknown')}</h3>
        <p class="mobile-line">+91 ${escapeHtml(mobile)}</p>
      </div>
      <div class="divider"></div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-label">Mobile</div>
          <div class="info-value">+91 ${escapeHtml(mobile)}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">Address</div>
          <div class="info-value">${escapeHtml(record.address || '—')}</div>
        </div>
        <div class="info-cell full">
          <div class="info-label">Email</div>
          <div class="info-value">${escapeHtml(record.email || '—')}</div>
        </div>
      </div>`;
    const avatar = resultCard.querySelector('.avatar');
    if (avatar) {
      avatar.addEventListener('error', () => {
        avatar.hidden = true;
        const fallback = avatar.nextElementSibling;
        if (fallback) fallback.style.display = 'grid';
      }, { once: true });
      const fallback = avatar.nextElementSibling;
      if (fallback) fallback.style.display = 'none';
    }
    resultCard.classList.add('show');
  }

  function renderFailed(data) {
    const message = data && data.error ? data.error : 'Not found';
    const generic = /not found/i.test(message);
    resultCard.innerHTML = `
      <div class="empty-state">
        <div class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5M8.5 10.8h4.6"/></svg>
        </div>
        <h3>${generic ? 'No profile found' : escapeHtml(message)}</h3>
        <p>${generic ? 'There were no caller details available for this number.' : 'Check your connection and API settings, then try again.'}</p>
      </div>`;
    resultCard.classList.add('show');
  }

  function openKeyModal() {
    modalError.textContent = '';
    modalInput.value = getKey();
    returnFocusTo = document.activeElement;
    modalOverlay.hidden = false;
    modalOverlay.classList.remove('hidden');
    forgetKey.hidden = !getKey();
    modalSave.textContent = getKey() ? 'Save changes' : 'Save key';
    window.requestAnimationFrame(() => modalInput.focus());
  }

  function closeKeyModal() {
    modalOverlay.hidden = true;
    modalOverlay.classList.add('hidden');
    if (returnFocusTo && typeof returnFocusTo.focus === 'function') returnFocusTo.focus();
  }

  function ensureKey() {
    if (getKey()) return true;
    openKeyModal();
    return false;
  }

  numberEl.addEventListener('input', () => {
    let digits = onlyDigits(numberEl.value);
    if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(2);
    numberEl.value = digits.slice(0, 10);
  });

  manageKey.addEventListener('click', openKeyModal);
  modalSave.addEventListener('click', () => {
    const value = modalInput.value.trim();
    if (!value) {
      modalError.textContent = 'Please enter your API key.';
      modalInput.focus();
      return;
    }
    if (!setKey(value)) return;
    syncKeyButton();
    closeKeyModal();
    setStatus('API key saved in this browser.', 'ok');
  });

  function dismissModal() {
    closeKeyModal();
  }

  modalCancel.addEventListener('click', dismissModal);
  modalClose.addEventListener('click', dismissModal);
  modalOverlay.addEventListener('click', (event) => {
    if (event.target === modalOverlay) dismissModal();
  });
  modalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      modalSave.click();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (modalOverlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not([hidden]), input:not([hidden])')]
      .filter((element) => !element.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  forgetKey.addEventListener('click', () => {
    if (!setKey('')) return;
    syncKeyButton();
    closeKeyModal();
    setStatus('Saved API key removed from this browser.', 'ok');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ensureKey()) return;

    const digits = onlyDigits(numberEl.value);
    if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
      setStatus('Enter a valid 10-digit Indian mobile number.', 'error');
      resultCard.classList.remove('show');
      numberEl.focus();
      return;
    }

    searchBtn.disabled = true;
    searchBtn.classList.add('is-loading');
    setStatus('Looking up this number…');
    resultCard.classList.remove('show');

    try {
      const number = encodeURIComponent('+91' + digits);
      const response = await fetch('/api/search?number=' + number, {
        headers: { 'x-api-key': getKey() },
      });
      const data = await response.json();
      if (response.status === 401) {
        setStatus('That API key was not accepted. Update it and try again.', 'error');
        openKeyModal();
        return;
      }
      if (data.status === 'success' && Array.isArray(data.records) && data.records.length) {
        renderSuccess(data);
        setStatus('Lookup complete.', 'ok');
      } else {
        renderFailed(data);
        setStatus(data.error || 'No profile found.', 'error');
      }
    } catch {
      renderFailed({ error: 'Network error' });
      setStatus('Could not reach the lookup service. Try again.', 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.classList.remove('is-loading');
    }
  });


  // --- Compact API quickstart ---
  const apiDocsModal = document.getElementById('apiDocsModal');
  const apiDialog = apiDocsModal?.querySelector('[role="dialog"]');
  const openApiDocs = document.getElementById('openApiDocs');
  const apiDocsClose = document.getElementById('apiDocsClose');
  const apiBaseUrlEl = document.getElementById('apiBaseUrl');
  const copyActiveSnippet = document.getElementById('copyActiveSnippet');
  const apiTabs = [...document.querySelectorAll('.api-tab')];
  let apiReturnFocus = null;

  function apiBase() {
    return window.location.origin.replace(/\/$/, '');
  }

  function fillApiExamples() {
    const base = apiBase();
    const endpoint = `${base}/api/search`;
    if (apiBaseUrlEl) apiBaseUrlEl.textContent = endpoint;

    const examples = {
      codeCurl: `curl -G '${endpoint}' \\\n+  -H 'x-api-key: YOUR_API_KEY' \\\n+  --data-urlencode 'number=+919876543210'`,
      codeJs: `const url = new URL('${endpoint}');\nurl.searchParams.set('number', '+919876543210');\n\nconst response = await fetch(url, {\n  headers: { 'x-api-key': 'YOUR_API_KEY' }\n});\nconsole.log(await response.json());`,
      codePython: `import requests\n\nres = requests.get(\n    '${endpoint}', params={'number': '+919876543210'},\n    headers={'x-api-key': 'YOUR_API_KEY'}, timeout=90)\nprint(res.json())`,
      codePhp: `<?php\n$url = '${endpoint}?' . http_build_query(['number' => '+919876543210']);\n$context = stream_context_create(['http' => ['header' => "x-api-key: YOUR_API_KEY\\r\\n"]]);\necho file_get_contents($url, false, $context);`,
    };
    examples.codeCurl = examples.codeCurl.replace(/\n\+/g, '\n');

    Object.entries(examples).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
  }

  function activateApiTab(tab, moveFocus = false) {
    const name = tab?.dataset.tab;
    if (!name) return;
    apiTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.api-panel').forEach((panel) => {
      const active = panel.id === `panel-${name}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    const codeIds = { curl: 'codeCurl', js: 'codeJs', python: 'codePython', php: 'codePhp' };
    if (copyActiveSnippet && codeIds[name]) copyActiveSnippet.dataset.copyTarget = codeIds[name];
    if (moveFocus) tab.focus();
  }

  function openApiDocsModal() {
    if (!apiDocsModal) return;
    apiReturnFocus = openApiDocs || document.activeElement;
    fillApiExamples();
    apiDocsModal.hidden = false;
    apiDocsModal.classList.remove('hidden');
    if (openApiDocs) openApiDocs.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => apiDocsClose?.focus());
  }

  function closeApiDocsModal() {
    if (!apiDocsModal) return;
    apiDocsModal.hidden = true;
    apiDocsModal.classList.add('hidden');
    if (openApiDocs) openApiDocs.setAttribute('aria-expanded', 'false');
    if (apiReturnFocus && typeof apiReturnFocus.focus === 'function') apiReturnFocus.focus();
    apiReturnFocus = null;
  }

  openApiDocs?.addEventListener('click', openApiDocsModal);
  apiDocsClose?.addEventListener('click', closeApiDocsModal);
  apiDocsModal?.addEventListener('click', (event) => {
    if (event.target === apiDocsModal) closeApiDocsModal();
  });

  apiTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateApiTab(tab));
    tab.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % apiTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + apiTabs.length) % apiTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = apiTabs.length - 1;
      else return;
      event.preventDefault();
      activateApiTab(apiTabs[nextIndex], true);
    });
  });

  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const originalLabel = button.textContent;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(target.textContent || '');
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy failed';
      }
      window.setTimeout(() => { button.textContent = originalLabel; }, 1400);
    });
  });

  apiDocsModal?.addEventListener('keydown', (event) => {
    if (apiDocsModal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeApiDocsModal();
      return;
    }
    if (event.key !== 'Tab' || !apiDialog) return;
    const focusable = [...apiDialog.querySelectorAll('button:not([disabled]), summary, [href], input:not([disabled]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  syncKeyButton();
})();
