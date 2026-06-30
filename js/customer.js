/**
 * Customer Request Page Logic
 * Wizard flow: Sport → Market → Game/ID → Submit
 * Uses server API instead of localStorage
 */

// --- State ---
let shopContext = {};
let selectedSport = null;
let selectedMarket = null;
let customerId = null;
let currentStep = 1;

const API_BASE = window.location.origin + '/api';

// --- Customer ID (persisted in localStorage only for identity) ---
function getCustomerId() {
    let id = localStorage.getItem('customerId');
    if (!id) {
        id = 'CUST-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        localStorage.setItem('customerId', id);
    }
    return id;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const lang = I18n.init('customerLang', 'de');
    updateLangButtons(lang);
    applyTranslations();

    if (!parseShopContext()) return;
    customerId = getCustomerId();
    renderSportGrid();
    updateNotificationBadge();
    pollForUpdates();
});

// --- Language ---
function changeLang(lang) {
    I18n.setLang(lang);
    updateLangButtons(lang);
    applyTranslations();
    if (!document.getElementById('status-view').classList.contains('hidden')) {
        renderMyRequests();
    }
}

function updateLangButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = I18n.t(key);
        if (text && text !== key) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = I18n.t(key);
        if (text && text !== key) el.placeholder = text;
    });
    document.title = I18n.t('cust_title');
}

function parseShopContext() {
    const params = new URLSearchParams(window.location.search);
    const akid = params.get('akid');

    if (!akid) {
        showError(I18n.t('cust_error_no_shop'));
        return false;
    }

    const shop = getShopByAkid(akid);
    if (!shop) {
        showError(I18n.t('cust_error_msg'));
        return false;
    }

    shopContext = {
        akid: shop.akid,
        accountName: shop.accountName,
        address: shop.address,
        region: shop.region,
        vip: shop.vip
    };
    document.getElementById('shop-name-display').textContent = shop.accountName;
    return true;
}

function showError(message) {
    document.getElementById('main-content').classList.add('hidden');
    document.getElementById('lang-switcher').classList.add('hidden');
    const errorView = document.getElementById('error-view');
    errorView.classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
}

// --- View Management ---
function switchView(view) {
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    document.getElementById('request-view').classList.add('hidden');
    document.getElementById('status-view').classList.add('hidden');
    document.getElementById('confirmation-view').classList.add('hidden');

    if (view === 'request') {
        document.getElementById('request-view').classList.remove('hidden');
    } else if (view === 'status') {
        document.getElementById('status-view').classList.remove('hidden');
        renderMyRequests();
    }
}

function showConfirmation() {
    document.getElementById('request-view').classList.add('hidden');
    document.getElementById('status-view').classList.add('hidden');
    document.getElementById('confirmation-view').classList.remove('hidden');

    const etaEl = document.getElementById('eta-message');
    etaEl.textContent = I18n.t('cust_eta_default');
}

// --- Wizard Steps ---
function goToStep(step) {
    currentStep = step;
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    document.getElementById('step-' + step).classList.remove('hidden');

    document.querySelectorAll('.step-dot').forEach(dot => {
        const s = parseInt(dot.dataset.step);
        dot.classList.remove('active', 'done');
        if (s === step) dot.classList.add('active');
        else if (s < step) dot.classList.add('done');
    });

    applyTranslations();
    if (step === 4) updateSummary();
}

// --- STEP 1: Sport Selection ---
function renderSportGrid() {
    var sports = [];
    for (var i = 0; i < PRESET_MARKETS.length; i++) {
        if (sports.indexOf(PRESET_MARKETS[i].category) === -1) {
            sports.push(PRESET_MARKETS[i].category);
        }
    }
    if (sports.indexOf('Sonstiges') === -1) sports.push('Sonstiges');

    const grid = document.getElementById('sport-grid');
    grid.innerHTML = sports.map(sport => `
        <div class="sport-card" onclick="selectSport('${sport}')">
            <div class="sport-icon">${SPORT_ICONS[sport] || '📋'}</div>
            <div class="sport-name">${sport}</div>
        </div>
    `).join('');
}

function selectSport(sport) {
    selectedSport = sport;
    renderMarketsForSport(sport);
    goToStep(2);
}

// --- STEP 2: Market Selection ---
function renderMarketsForSport(sport) {
    const grid = document.getElementById('market-grid');
    const markets = PRESET_MARKETS.filter(m => m.category === sport);

    if (markets.length > 0) {
        grid.innerHTML = markets.map(market => `
            <div class="market-card" data-id="${market.id}" onclick="selectMarket('${market.id}')">
                <div class="market-name">${market.name}</div>
            </div>
        `).join('');
    } else {
        grid.innerHTML = '<p class="text-muted" style="font-size: 0.9rem; grid-column: 1/-1; text-align: center;">—</p>';
    }

    selectedMarket = null;
    document.getElementById('custom-market').value = '';
}

function selectMarket(marketId) {
    const market = PRESET_MARKETS.find(m => m.id === marketId);
    if (!market) return;

    selectedMarket = market;
    document.querySelectorAll('.market-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-id="${marketId}"]`).classList.add('selected');
    document.getElementById('custom-market').value = '';
    goToStep(3);
}

function handleCustomInput() {
    const value = document.getElementById('custom-market').value.trim();
    if (value) {
        selectedMarket = null;
        document.querySelectorAll('.market-card').forEach(c => c.classList.remove('selected'));
    }
}

function submitCustomMarket() {
    const value = document.getElementById('custom-market').value.trim();
    if (value) {
        selectedMarket = null;
        goToStep(3);
    }
}

// --- STEP 3: Game/ID (mandatory) ---
function validateStep3() {
    var value = document.getElementById('event-name').value.trim();
    var btn = document.getElementById('step3-next-btn');
    if (btn) btn.disabled = (value.length === 0);
}

// --- STEP 4: Summary & Submit ---
function updateSummary() {
    const marketName = selectedMarket ? selectedMarket.name : document.getElementById('custom-market').value.trim();
    const gameName = document.getElementById('event-name').value.trim();

    document.getElementById('summary-sport').textContent = selectedSport || '';
    document.getElementById('summary-market').textContent = marketName || '—';
    document.getElementById('summary-game').textContent = gameName ? '🎮 ' + gameName : '';
}

// --- Submit (API) ---
async function submitRequest() {
    const customMarket = document.getElementById('custom-market').value.trim();
    const eventName = document.getElementById('event-name').value.trim();
    const marketName = selectedMarket ? selectedMarket.name : customMarket;

    if (!marketName) {
        showToast(I18n.t('cust_error_no_shop'), 'warning');
        return;
    }

    // Check duplicates via API
    try {
        const existing = await fetch(`${API_BASE}/requests?akid=${shopContext.akid}&customerId=${customerId}`).then(r => r.json());
        const duplicate = existing.find(r =>
            (r.marketName === marketName || r.customMarket === marketName) &&
            !['declined', 'expired'].includes(r.status)
        );
        if (duplicate) {
            showToast(I18n.t('cust_duplicate_warning'), 'warning');
            return;
        }
    } catch (e) {
        // Continue even if check fails
    }

    const request = {
        akid: shopContext.akid,
        accountName: shopContext.accountName,
        address: shopContext.address,
        region: shopContext.region,
        customerId,
        marketId: selectedMarket ? selectedMarket.id : null,
        marketName: selectedMarket ? selectedMarket.name : null,
        customMarket: customMarket || null,
        category: selectedSport || 'Custom',
        eventName: eventName || null,
        eventTime: null,
        notes: null,
        source: 'qr_scan'
    };

    try {
        const res = await fetch(`${API_BASE}/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        if (res.ok) {
            showConfirmation();
            showToast(I18n.t('cust_success_toast'), 'success');
            updateNotificationBadge();
        } else {
            showToast('Error submitting request', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    }
}

function resetForm() {
    selectedSport = null;
    selectedMarket = null;
    currentStep = 1;
    document.getElementById('custom-market').value = '';
    document.getElementById('event-name').value = '';
    document.querySelectorAll('.market-card').forEach(c => c.classList.remove('selected'));

    goToStep(1);
    document.getElementById('confirmation-view').classList.add('hidden');
    document.getElementById('request-view').classList.remove('hidden');

    document.querySelector('[data-view="request"]').classList.add('active');
    document.querySelector('[data-view="status"]').classList.remove('active');
}

// --- My Requests / Status (API) ---
async function renderMyRequests() {
    const listEl = document.getElementById('requests-list');
    const emptyEl = document.getElementById('no-requests');

    try {
        const requests = await fetch(`${API_BASE}/requests?customerId=${customerId}`).then(r => r.json());

        if (requests.length === 0) {
            listEl.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        const sorted = [...requests].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        listEl.innerHTML = sorted.map(req => {
            const marketDisplay = req.marketName || req.customMarket || 'Unknown';
            const statusLabel = I18n.getStatusMessage(req.status);
            const timeAgo = I18n.getTimeAgo(req.submittedAt);

            const timeline = (req.statusHistory || []).map((entry, i) => {
                const isActive = i === req.statusHistory.length - 1;
                return `
                    <div class="timeline-item ${isActive ? 'active' : ''}">
                        <div class="timeline-status" style="color: ${STATUS_COLORS[entry.status] || '#999'}">
                            ${I18n.getStatusLabel(entry.status)}
                        </div>
                        <div class="timeline-time">${formatDate(entry.timestamp)}</div>
                        ${entry.note ? `<div class="timeline-note">${escapeHtml(entry.note)}</div>` : ''}
                    </div>
                `;
            }).join('');

            return `
                <div class="request-status-card">
                    <div class="flex-between">
                        <div class="request-market">${escapeHtml(marketDisplay)}</div>
                        <span class="badge badge-${req.status}">${I18n.getStatusLabel(req.status)}</span>
                    </div>
                    ${req.eventName ? `<div class="request-time">🎮 ${escapeHtml(req.eventName)}</div>` : ''}
                    <div class="request-time">${I18n.t('cust_submitted_ago')} ${timeAgo}</div>
                    <p style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">${statusLabel}</p>
                    <div class="status-timeline">${timeline}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<p class="text-muted">Verbindungsfehler</p>';
    }
}

// --- Notifications (API) ---
async function updateNotificationBadge() {
    if (!customerId) return;
    try {
        const notifications = await fetch(`${API_BASE}/notifications?customerId=${customerId}`).then(r => r.json());
        const unread = notifications.filter(n => !n.read).length;
        const badge = document.getElementById('notif-count');

        if (unread > 0) {
            badge.textContent = unread;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) {
        // Silently fail
    }
}

function pollForUpdates() {
    setInterval(() => {
        updateNotificationBadge();
        if (!document.getElementById('status-view').classList.contains('hidden')) {
            renderMyRequests();
        }
    }, 5000);
}

// --- Utilities ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('de-DE', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}
