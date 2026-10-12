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
        <div class="badge" aria-label="Truecaller result">t</div>
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
    const help = data && data.help ? data.help : generic ? 'There were no caller details available for this number.' : 'Check your connection and API settings, then try again.';
    resultCard.innerHTML = `
      <div class="empty-state">
        <div class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5M8.5 10.8h4.6"/></svg>
        </div>
        <h3>${generic ? 'No profile found' : escapeHtml(message)}</h3>
        <p>${escapeHtml(help)}</p>
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
      setStatus('Enter a valid 10-digit Indian mobile number starting with 6–9.', 'error');
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

  syncKeyButton();
})();
