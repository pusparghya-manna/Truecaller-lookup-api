(function () {
  const KEY_STORAGE = 'truefind_api_key';

  const numberEl = document.getElementById('number');
  const searchBtn = document.getElementById('search');
  const statusEl = document.getElementById('status');
  const resultCard = document.getElementById('resultCard');
  const modalOverlay = document.getElementById('keyModal');
  const modalInput = document.getElementById('modalKey');
  const modalError = document.getElementById('modalError');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');

  function getKey() {
    try {
      return localStorage.getItem(KEY_STORAGE) || '';
    } catch {
      return '';
    }
  }

  function setKey(value) {
    try {
      localStorage.setItem(KEY_STORAGE, value);
    } catch (_) {}
  }

  function onlyDigits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function setStatus(text, type) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function avatarHtml(record) {
    if (record.profileImage) {
      return `
        <div class="avatar-wrap">
          <img class="avatar" src="${escapeAttr(record.profileImage)}" alt=""
            onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
          <div class="avatar-fallback" style="display:none">${initials(record.name)}</div>
          <div class="badge">t</div>
        </div>`;
    }
    return `
      <div class="avatar-wrap">
        <div class="avatar-fallback">${initials(record.name)}</div>
        <div class="badge">t</div>
      </div>`;
  }

  function renderSuccess(data) {
    const r = data.records[0] || {};
    const mobile = data.number || r.mobile || '';
    resultCard.innerHTML = `
      <div class="profile">
        ${avatarHtml(r)}
        <h2 class="name">${escapeHtml(r.name || 'Unknown')}</h2>
        <p class="mobile-line">+91 ${escapeHtml(mobile)}</p>
      </div>
      <div class="divider"></div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-label">Mobile</div>
          <div class="info-value">${escapeHtml(mobile)}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">Address</div>
          <div class="info-value">${escapeHtml(r.address || '—')}</div>
        </div>
        <div class="info-cell full">
          <div class="info-label">Email</div>
          <div class="info-value">${escapeHtml(r.email || '—')}</div>
        </div>
      </div>`;
    resultCard.classList.add('show');
  }

  function renderFailed(data) {
    const msg = (data && data.error) ? data.error : 'Not found';
    resultCard.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h3>${escapeHtml(msg)}</h3>
        <p>No profile found for this number.</p>
      </div>`;
    resultCard.classList.add('show');
  }

  function openKeyModal(force) {
    modalError.textContent = '';
    modalInput.value = getKey();
    modalOverlay.classList.remove('hidden');
    setTimeout(() => modalInput.focus(), 50);
    if (force) modalCancel.style.display = 'none';
    else modalCancel.style.display = '';
  }

  function closeKeyModal() {
    modalOverlay.classList.add('hidden');
  }

  function ensureKey() {
    if (getKey()) return true;
    openKeyModal(true);
    return false;
  }

  numberEl.addEventListener('input', () => {
    let d = onlyDigits(numberEl.value);
    if (d.startsWith('91') && d.length > 10) d = d.slice(2);
    if (d.length > 10) d = d.slice(0, 10);
    numberEl.value = d;
  });

  numberEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });

  modalSave.addEventListener('click', () => {
    const v = modalInput.value.trim();
    if (!v) {
      modalError.textContent = 'Please enter your API key.';
      return;
    }
    setKey(v);
    closeKeyModal();
    setStatus('API key saved.', 'ok');
  });

  modalCancel.addEventListener('click', () => {
    if (getKey()) closeKeyModal();
  });

  modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modalSave.click();
  });

  searchBtn.addEventListener('click', async () => {
    if (!ensureKey()) return;

    const digits = onlyDigits(numberEl.value);
    if (digits.length !== 10) {
      setStatus('Enter a valid 10-digit Indian mobile number.', 'error');
      resultCard.classList.remove('show');
      return;
    }

    searchBtn.disabled = true;
    setStatus('Searching…');
    resultCard.classList.remove('show');

    try {
      const q = encodeURIComponent('+91' + digits);
      const res = await fetch('/api/search?number=' + q, {
        headers: { 'x-api-key': getKey() }
      });
      const data = await res.json();

      if (res.status === 401) {
        setStatus('Invalid API key. Enter a new one.', 'error');
        openKeyModal(true);
        return;
      }

      if (data.status === 'success' && data.records && data.records.length) {
        renderSuccess(data);
        setStatus('Found', 'ok');
      } else {
        renderFailed(data);
        setStatus(data.error || 'Not found', 'error');
      }
    } catch {
      renderFailed({ error: 'Network error' });
      setStatus('Network error. Try again.', 'error');
    } finally {
      searchBtn.disabled = false;
    }
  });

  // First visit: show key popup
  if (!getKey()) {
    openKeyModal(true);
  }
})();
