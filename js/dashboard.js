/**
 * Bookmaker Dashboard Logic
 * Uses server API instead of localStorage
 */

// --- State ---
let currentSection = 'queue';
let currentFilter = 'pending';
let currentShopFilter = '';
let selectedRequestId = null;
let declineRequestId = null;
let allRequests = [];

const API_BASE = window.location.origin + '/api';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const lang = I18n.init('dashLang', 'de');
    updateDashLangButtons(lang);
    applyDashTranslations();
    loadBookieName();
    populateDeclineReasons();
    refreshQueue();
    startPolling();
    setupResponsive();
});

// --- Language ---
function changeDashLang(lang) {
    I18n.setLang(lang);
    updateDashLangButtons(lang);
    applyDashTranslations();
    populateDeclineReasons();
    switch (currentSection) {
        case 'queue': refreshQueue(); break;
        case 'all-requests': renderAllRequests(); break;
        case 'statistics': renderStatistics(); break;
        case 'audit-log': renderAuditLog(); break;
    }
    if (selectedRequestId) openDetail(selectedRequestId);
}

function updateDashLangButtons(lang) {
    document.querySelectorAll('.dash-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

function applyDashTranslations() {
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
    document.title = I18n.t('dash_title');
}

function loadBookieName() {
    const name = localStorage.getItem('bookieName') || 'Bookie Admin';
    document.getElementById('bookie-name').value = name;
}

function populateDeclineReasons() {
    const select = document.getElementById('decline-reason');
    select.innerHTML = DECLINE_REASONS.map(r =>
        `<option value="${r.code}">${I18n.t('decline_' + r.code)}</option>`
    ).join('');
}

// --- Navigation ---
function navigateTo(section) {
    currentSection = section;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`).classList.add('active');

    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${section}`).classList.remove('hidden');

    switch (section) {
        case 'queue': refreshQueue(); break;
        case 'all-requests': renderAllRequests(); break;
        case 'statistics': renderStatistics(); break;
        case 'audit-log': renderAuditLog(); break;
    }
    document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function setupResponsive() {
    const checkWidth = () => {
        const btn = document.getElementById('mobile-menu-btn');
        btn.style.display = window.innerWidth <= 1024 ? 'inline-flex' : 'none';
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
}

// --- Queue Management (API) ---
async function refreshQueue() {
    try {
        allRequests = await fetch(`${API_BASE}/requests`).then(r => r.json());
        updateQueueCount(allRequests);
        updateStatsOverview(allRequests);
        renderQueue(allRequests);
        populateShopFilter(allRequests);
    } catch (e) {
        console.error('Failed to refresh queue:', e);
    }
}

function updateQueueCount(requests) {
    const pending = requests.filter(r => ['submitted', 'under_review'].includes(r.status));
    document.getElementById('queue-count').textContent = pending.length;

    const reviewing = requests.filter(r => r.status === 'under_review').length;
    const reviewBadge = document.getElementById('review-notify-count');
    if (reviewing > 0) {
        reviewBadge.textContent = reviewing;
        reviewBadge.classList.remove('hidden');
    } else {
        reviewBadge.classList.add('hidden');
    }
}

function updateStatsOverview(requests) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const pending = requests.filter(r => r.status === 'submitted').length;
    const reviewing = requests.filter(r => r.status === 'under_review').length;
    const approvedToday = requests.filter(r =>
        ['approved', 'available'].includes(r.status) &&
        r.lastUpdated && new Date(r.lastUpdated) >= today
    ).length;
    const declinedToday = requests.filter(r =>
        r.status === 'declined' &&
        r.lastUpdated && new Date(r.lastUpdated) >= today
    ).length;

    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-reviewing').textContent = reviewing;
    document.getElementById('stat-approved-today').textContent = approvedToday;
    document.getElementById('stat-declined-today').textContent = declinedToday;

    // Avg review time
    const reviewed = requests.filter(r => r.statusHistory && r.statusHistory.length > 1);
    if (reviewed.length > 0) {
        const totalTime = reviewed.reduce((sum, r) => {
            const submitted = new Date(r.statusHistory[0].timestamp);
            const firstReview = new Date(r.statusHistory[1].timestamp);
            return sum + (firstReview - submitted);
        }, 0);
        const avg = Math.round(totalTime / reviewed.length / 60000);
        document.getElementById('stat-avg-time').textContent = avg > 0 ? avg + 'm' : '—';
    } else {
        document.getElementById('stat-avg-time').textContent = '—';
    }
}

function populateShopFilter(requests) {
    const shops = [...new Set(requests.map(r => r.akid))];
    const select = document.getElementById('shop-filter');
    select.innerHTML = `<option value="">${I18n.t('dash_all_shops')}</option>` +
        shops.map(s => {
            const meta = (typeof getShopByAkid === 'function') ? getShopByAkid(s) : null;
            const label = meta ? meta.accountName : s;
            return `<option value="${s}">${label}</option>`;
        }).join('');
}

function filterQueue(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    renderQueue(allRequests);
}

function applyFilters() {
    currentShopFilter = document.getElementById('shop-filter').value;
    renderQueue(allRequests);
}

function calculatePriority(request) {
    let priority = 0;
    let reasons = [];

    const shop = (typeof getShopByAkid === 'function') ? getShopByAkid(request.akid) : null;
    if (shop && shop.vip) {
        priority += 3;
        reasons.push('VIP shop');
    }

    if (request.eventTime) {
        const minutesUntilEvent = (new Date(request.eventTime) - new Date()) / 60000;
        if (minutesUntilEvent <= 30 && minutesUntilEvent > 0) {
            priority += 5;
            reasons.push('Urgent');
        }
    }

    // High demand check
    const same = allRequests.filter(r =>
        r.akid === request.akid &&
        (r.marketName === request.marketName || r.customMarket === request.marketName) &&
        !['declined', 'expired'].includes(r.status)
    );
    if (same.length >= 3) {
        priority += 2;
        reasons.push('High demand (' + same.length + ')');
    }

    return { score: priority, reasons };
}

function renderQueue(requests) {
    let filtered = requests;

    if (currentFilter === 'pending') {
        filtered = filtered.filter(r => r.status === 'submitted');
    } else if (currentFilter === 'under_review') {
        filtered = filtered.filter(r => r.status === 'under_review');
    } else if (currentFilter === 'all') {
        filtered = filtered.filter(r => !['declined', 'expired'].includes(r.status));
    } else if (currentFilter === 'high-priority') {
        filtered = filtered.filter(r => calculatePriority(r).score >= 3);
    }

    if (currentShopFilter) {
        filtered = filtered.filter(r => r.akid === currentShopFilter);
    }

    filtered.sort((a, b) => {
        const pA = calculatePriority(a).score;
        const pB = calculatePriority(b).score;
        if (pB !== pA) return pB - pA;
        return new Date(a.submittedAt) - new Date(b.submittedAt);
    });

    const tbody = document.getElementById('queue-table-body');
    const emptyEl = document.getElementById('queue-empty');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');

    tbody.innerHTML = filtered.map(req => {
        const market = req.marketName || req.customMarket || 'Unknown';
        const priority = calculatePriority(req);
        const priorityLevel = priority.score >= 5 ? 'high' : priority.score >= 2 ? 'medium' : 'low';
        const timeAgo = I18n.getTimeAgo(req.submittedAt);
        const eventTimeStr = req.eventTime ? formatDate(req.eventTime) : '—';

        return `
            <tr onclick="openDetail('${req.id}')" style="cursor: pointer;">
                <td>
                    <div class="priority-indicator">
                        <span class="priority-dot ${priorityLevel}"></span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${I18n.t('dash_priority_' + priorityLevel)}</span>
                    </div>
                </td>
                <td class="request-market-cell">${escapeHtml(market)}</td>
                <td class="request-shop-cell">${req.playerDetail ? '👤 ' + escapeHtml(req.playerDetail) : '—'}</td>
                <td class="request-shop-cell">${escapeHtml(req.accountName || req.akid)}</td>
                <td class="request-time-cell">${eventTimeStr}</td>
                <td class="request-time-cell">${timeAgo}</td>
                <td><span class="badge badge-${req.status}">${I18n.getStatusLabel(req.status)}</span></td>
                <td>
                    <div class="request-actions" onclick="event.stopPropagation()">
                        ${req.status === 'submitted' ? `<button class="btn btn-primary btn-sm" onclick="quickAction('${req.id}', 'under_review')">${I18n.t('dash_btn_review')}</button>` : ''}
                        ${['submitted', 'under_review'].includes(req.status) ? `
                            <button class="btn btn-success btn-sm" onclick="quickAction('${req.id}', 'available')">${I18n.t('dash_btn_approve')}</button>
                            <button class="btn btn-danger btn-sm" onclick="openDeclineModal('${req.id}')">${I18n.t('dash_btn_decline')}</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// --- Quick Actions (API) ---
async function quickAction(requestId, newStatus) {
    const bookieName = localStorage.getItem('bookieName') || 'Bookie Admin';
    let note = '';

    switch (newStatus) {
        case 'under_review': note = I18n.t('dash_review_note'); break;
        case 'available': note = I18n.t('dash_approve_note'); break;
    }

    try {
        await fetch(`${API_BASE}/requests/${requestId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, note, userId: bookieName })
        });
        showToast(I18n.getStatusLabel(newStatus), 'success');
        refreshQueue();
        if (selectedRequestId === requestId) openDetail(requestId);
    } catch (e) {
        showToast('Error updating status', 'error');
    }
}

// --- Decline ---
function openDeclineModal(requestId) {
    declineRequestId = requestId;
    document.getElementById('decline-modal').classList.remove('hidden');
    document.getElementById('decline-note').value = '';
}

function closeDeclineModal() {
    declineRequestId = null;
    document.getElementById('decline-modal').classList.add('hidden');
}

async function confirmDecline() {
    if (!declineRequestId) return;

    const reason = document.getElementById('decline-reason').value;
    const reasonLabel = I18n.t('decline_' + reason);
    const note = document.getElementById('decline-note').value.trim();
    const bookieName = localStorage.getItem('bookieName') || 'Bookie Admin';

    const fullNote = `${I18n.t('dash_btn_decline')}: ${reasonLabel}${note ? ' - ' + note : ''}`;

    try {
        await fetch(`${API_BASE}/requests/${declineRequestId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'declined', note: fullNote, userId: bookieName })
        });
        showToast(I18n.getStatusLabel('declined'), 'warning');
        closeDeclineModal();
        refreshQueue();
        if (selectedRequestId === declineRequestId) openDetail(declineRequestId);
    } catch (e) {
        showToast('Error', 'error');
    }
}

// --- Detail Panel ---
async function openDetail(requestId) {
    selectedRequestId = requestId;
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;

    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');
    const priority = calculatePriority(request);
    const priorityLevel = priority.score >= 5 ? 'high' : priority.score >= 2 ? 'medium' : 'low';
    const market = request.marketName || request.customMarket || 'Unknown';

    content.innerHTML = `
        <div class="detail-info-grid">
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_request_id')}</label>
                <div class="value">${request.id}</div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_market')}</label>
                <div class="value" style="font-weight: 600;">${escapeHtml(market)}</div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_category')}</label>
                <div class="value">${request.category || '—'}</div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_event')}</label>
                <div class="value">${escapeHtml(request.eventName) || '—'}</div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_shop')}</label>
                <div class="value">${request.accountName || request.akid}<br><span style="font-size: 0.8rem; color: var(--text-muted);">${request.address || ''}</span></div>
            </div>
            <div class="detail-info-item">
                <label>AKID</label>
                <div class="value" style="font-size: 0.85rem;">${request.akid || '—'}</div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_status')}</label>
                <div class="value"><span class="badge badge-${request.status}">${I18n.getStatusLabel(request.status)}</span></div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_priority')}</label>
                <div class="value">
                    <span class="badge badge-priority-${priorityLevel}">${I18n.t('dash_priority_' + priorityLevel).toUpperCase()} (${priority.score})</span>
                    ${priority.reasons.length > 0 ? `<div style="margin-top: 4px; font-size: 0.8rem; color: var(--text-muted);">${priority.reasons.join(', ')}</div>` : ''}
                </div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_submitted')}</label>
                <div class="value">${formatDate(request.submittedAt)}</div>
            </div>
            <div class="detail-info-item">
                <label>${I18n.t('dash_detail_customer_id')}</label>
                <div class="value" style="font-size: 0.8rem;">${request.customerId}</div>
            </div>
            ${request.playerDetail ? `
                <div class="detail-info-item">
                    <label>Details</label>
                    <div class="value">👤 ${escapeHtml(request.playerDetail)} <button class="btn btn-secondary btn-sm" onclick="editPlayerDetail('${request.id}')" style="margin-left: 8px;">✏️</button></div>
                </div>
            ` : ''}
        </div>

        <div class="detail-actions">
            ${request.status === 'submitted' ? `<button class="btn btn-warning" onclick="quickAction('${request.id}', 'under_review')">🔍 ${I18n.t('dash_btn_review')}</button>` : ''}
            ${['submitted', 'under_review'].includes(request.status) ? `
                <button class="btn btn-success" onclick="quickAction('${request.id}', 'available')">✓ ${I18n.t('dash_btn_approve')}</button>
                <button class="btn btn-danger" onclick="openDeclineModal('${request.id}')">✗ ${I18n.t('dash_btn_decline')}</button>
            ` : ''}
            ${!['expired', 'available'].includes(request.status) ? `<button class="btn btn-secondary" onclick="quickAction('${request.id}', 'expired')">⏰ ${I18n.t('dash_btn_expire')}</button>` : ''}
        </div>

        <div class="audit-section">
            <h4>${I18n.t('dash_detail_history')}</h4>
            ${(request.statusHistory || []).map(entry => `
                <div class="audit-item">
                    <div class="audit-action">
                        <span class="badge badge-${entry.status}" style="font-size: 0.65rem;">${I18n.getStatusLabel(entry.status)}</span>
                        ${entry.note ? `<span style="margin-left: 8px; font-size: 0.8rem;">${escapeHtml(entry.note)}</span>` : ''}
                    </div>
                    <div class="audit-time">${formatDate(entry.timestamp)}${entry.userId ? ' — ' + entry.userId : ''}</div>
                </div>
            `).reverse().join('')}
        </div>
    `;

    panel.classList.add('open');
}

function closeDetailPanel() {
    selectedRequestId = null;
    document.getElementById('detail-panel').classList.remove('open');
}

// --- All Requests ---
async function renderAllRequests(searchQuery) {
    try {
        let requests = await fetch(`${API_BASE}/requests`).then(r => r.json());

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            requests = requests.filter(r =>
                (r.id || '').toLowerCase().includes(q) ||
                (r.marketName || '').toLowerCase().includes(q) ||
                (r.customMarket || '').toLowerCase().includes(q) ||
                (r.akid || '').toLowerCase().includes(q) ||
                (r.accountName || '').toLowerCase().includes(q) ||
                (r.status || '').toLowerCase().includes(q)
            );
        }

        requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        const tbody = document.getElementById('all-requests-body');
        const emptyEl = document.getElementById('all-requests-empty');

        if (requests.length === 0) {
            tbody.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');

        tbody.innerHTML = requests.map(req => {
            const market = req.marketName || req.customMarket || 'Unknown';
            return `
                <tr onclick="openDetail('${req.id}')" style="cursor: pointer;">
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${req.id}</td>
                    <td class="request-market-cell">${escapeHtml(market)}</td>
                    <td class="request-shop-cell">${req.playerDetail ? '👤 ' + escapeHtml(req.playerDetail) : '—'}</td>
                    <td class="request-shop-cell">${escapeHtml(req.accountName || req.akid)}</td>
                    <td class="request-shop-cell">${req.customerId ? req.customerId.substring(0, 12) + '...' : '—'}</td>
                    <td class="request-time-cell">${formatDate(req.submittedAt)}</td>
                    <td><span class="badge badge-${req.status}">${I18n.getStatusLabel(req.status)}</span></td>
                    <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openDetail('${req.id}')">${I18n.t('view')}</button></td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load requests:', e);
    }
}

function searchAllRequests(query) {
    renderAllRequests(query);
}

// --- Statistics (API) ---
async function renderStatistics() {
    try {
        const stats = await fetch(`${API_BASE}/stats`).then(r => r.json());

        document.getElementById('total-requests').textContent = stats.total;
        document.getElementById('approval-rate').textContent = stats.approvalRate + '%';
        document.getElementById('decline-rate').textContent = stats.declineRate + '%';
        document.getElementById('avg-review-time').textContent = stats.avgReviewTime > 0 ? stats.avgReviewTime + 'm' : '—';

        renderBarChart('top-markets-chart', stats.topMarkets.map(m => ({ label: m.name, value: m.count })));

        const sportData = Object.entries(stats.bySport).map(([name, count]) => ({ label: name, value: count }));
        renderBarChart('by-sport-chart', sportData);

        const shopData = Object.entries(stats.byShop).map(([akid, count]) => {
            const meta = (typeof getShopByAkid === 'function') ? getShopByAkid(akid) : null;
            return { label: meta ? meta.accountName : akid, value: count };
        });
        renderBarChart('by-shop-chart', shopData);
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

function renderBarChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!data || data.length === 0) {
        container.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">${I18n.t('no_data')}</p>`;
        return;
    }

    const maxValue = Math.max(...data.map(d => d.value));

    container.innerHTML = data.slice(0, 8).map(item => {
        const width = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        return `
            <div class="bar-item">
                <span class="bar-label">${escapeHtml(item.label)}</span>
                <div class="bar-fill-container">
                    <div class="bar-fill" style="width: ${width}%">${item.value}</div>
                </div>
            </div>
        `;
    }).join('');
}

// --- Audit Log (API) ---
async function renderAuditLog() {
    try {
        const log = await fetch(`${API_BASE}/audit`).then(r => r.json());
        const container = document.getElementById('audit-log-list');
        const emptyEl = document.getElementById('audit-empty');

        if (log.length === 0) {
            container.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        const sorted = [...log].reverse();

        container.innerHTML = sorted.map(entry => `
            <div class="card" style="margin-bottom: 8px; padding: 14px 18px;">
                <div class="flex-between">
                    <div>
                        <strong style="font-size: 0.85rem;">${formatAuditAction(entry.action)}</strong>
                        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">${entry.requestId}</span>
                    </div>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(entry.timestamp)}</span>
                </div>
                ${entry.fromStatus ? `
                    <div style="margin-top: 4px; font-size: 0.8rem;">
                        <span class="badge badge-${entry.fromStatus}" style="font-size: 0.6rem;">${I18n.getStatusLabel(entry.fromStatus)}</span>
                        → <span class="badge badge-${entry.toStatus}" style="font-size: 0.6rem;">${I18n.getStatusLabel(entry.toStatus)}</span>
                    </div>
                ` : ''}
                ${entry.details && entry.details.userId ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${entry.details.userId}</div>` : ''}
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load audit log:', e);
    }
}

function formatAuditAction(action) {
    const labels = {
        request_created: '📥 ' + I18n.t('dash_audit_created'),
        status_change: '🔄 ' + I18n.t('dash_audit_changed')
    };
    return labels[action] || action;
}

async function exportAuditLog() {
    try {
        const log = await fetch(`${API_BASE}/audit`).then(r => r.json());
        const csv = [
            'Timestamp,Action,Request ID,From Status,To Status,User',
            ...log.map(e => `${e.timestamp},${e.action},${e.requestId},${e.fromStatus || ''},${e.toStatus || ''},${(e.details && e.details.userId) || ''}`)
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(I18n.t('dash_exported_toast'), 'success');
    } catch (e) {
        showToast('Export failed', 'error');
    }
}

// --- Settings ---
async function generateSampleData() {
    const activeShops = getAllActiveShops();
    const statuses = ['submitted', 'under_review', 'available', 'declined'];
    const events = [
        'Liverpool vs Arsenal', 'Man City vs Chelsea', 'Real Madrid vs Barcelona',
        'Djokovic vs Alcaraz', 'Lakers vs Celtics', 'McGregor vs Chandler',
        'Tottenham vs West Ham', 'PSG vs Bayern Munich'
    ];

    const requests = [];
    for (let i = 0; i < 20; i++) {
        const shop = activeShops[Math.floor(Math.random() * activeShops.length)];
        const market = PRESET_MARKETS[Math.floor(Math.random() * PRESET_MARKETS.length)];
        const useCustom = Math.random() > 0.7;

        requests.push({
            akid: shop.akid,
            accountName: shop.accountName,
            address: shop.address,
            region: shop.region,
            customerId: 'CUST-SAMPLE-' + (i + 1).toString().padStart(3, '0'),
            marketId: useCustom ? null : market.id,
            marketName: useCustom ? null : market.name,
            customMarket: useCustom ? 'Spieler ' + (i + 1) + ' erzielt Tor' : null,
            category: market.category,
            eventName: events[Math.floor(Math.random() * events.length)],
            eventTime: null,
            notes: null,
            source: 'qr_scan'
        });
    }

    try {
        await fetch(`${API_BASE}/data/sample`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests })
        });
        showToast(I18n.t('dash_generated_toast'), 'success');
        refreshQueue();
    } catch (e) {
        showToast('Error generating data', 'error');
    }
}

async function confirmClearData() {
    if (confirm(I18n.t('dash_settings_clear_confirm'))) {
        try {
            await fetch(`${API_BASE}/data`, { method: 'DELETE' });
            showToast(I18n.t('dash_cleared_toast'), 'warning');
            refreshQueue();
        } catch (e) {
            showToast('Error clearing data', 'error');
        }
    }
}

// --- Polling ---
function startPolling() {
    setInterval(() => {
        if (currentSection === 'queue') refreshQueue();
    }, 3000);
}

// --- Edit Player Detail ---
var editPlayerRequestId = null;

function editPlayerDetail(requestId) {
    editPlayerRequestId = requestId;
    var request = allRequests.find(function(r) { return r.id === requestId; });
    if (!request) return;
    document.getElementById('edit-player-input').value = request.playerDetail || '';
    document.getElementById('player-template').value = '';
    document.getElementById('edit-player-modal').classList.remove('hidden');
}

function applyPlayerTemplate() {
    var tmpl = document.getElementById('player-template').value;
    if (!tmpl) return;
    var current = document.getElementById('edit-player-input').value.trim();
    // Try to extract player name from current value (first word(s) before "erzielt"/"erhält")
    var name = '';
    if (current) {
        var parts = current.split(/\s+(erzielt|erh)/i);
        if (parts[0]) name = parts[0].trim();
    }
    if (!name) name = '{Spielername}';
    var result = tmpl.replace('{name}', name);
    document.getElementById('edit-player-input').value = result;
}

function closeEditPlayerModal() {
    editPlayerRequestId = null;
    document.getElementById('edit-player-modal').classList.add('hidden');
}

async function savePlayerDetail() {
    if (!editPlayerRequestId) return;
    var newVal = document.getElementById('edit-player-input').value.trim();
    if (!newVal) return;
    try {
        await fetch(API_BASE + '/requests/' + editPlayerRequestId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerDetail: newVal })
        });
        showToast('Spieler aktualisiert', 'success');
        closeEditPlayerModal();
        refreshQueue();
        if (selectedRequestId === editPlayerRequestId) openDetail(editPlayerRequestId);
    } catch(e) {
        showToast('Fehler', 'error');
    }
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
