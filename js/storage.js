/**
 * Storage layer for Market Request system
 * Uses localStorage as a mock backend for prototype
 */

const Storage = {
    KEYS: {
        REQUESTS: 'marketRequests',
        AUDIT_LOG: 'auditLog',
        NOTIFICATIONS: 'notifications'
    },

    // --- Request Management ---

    getRequests() {
        return JSON.parse(localStorage.getItem(this.KEYS.REQUESTS) || '[]');
    },

    saveRequests(requests) {
        localStorage.setItem(this.KEYS.REQUESTS, JSON.stringify(requests));
    },

    addRequest(request) {
        const requests = this.getRequests();
        request.id = 'REQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
        request.submittedAt = new Date().toISOString();
        request.status = 'submitted';
        request.statusHistory = [{
            status: 'submitted',
            timestamp: new Date().toISOString(),
            note: 'Request submitted by customer'
        }];
        requests.push(request);
        this.saveRequests(requests);
        this.logAudit('request_created', request.id, null, 'submitted', request);
        return request;
    },

    getRequestById(id) {
        return this.getRequests().find(r => r.id === id);
    },

    getRequestsByShop(akid) {
        return this.getRequests().filter(r => r.akid === akid);
    },

    getRequestsByCustomer(customerId) {
        return this.getRequests().filter(r => r.customerId === customerId);
    },

    updateRequestStatus(requestId, newStatus, note, userId) {
        const requests = this.getRequests();
        const request = requests.find(r => r.id === requestId);
        if (!request) return null;

        const oldStatus = request.status;
        request.status = newStatus;
        request.lastUpdated = new Date().toISOString();
        request.statusHistory.push({
            status: newStatus,
            timestamp: new Date().toISOString(),
            note: note || '',
            userId: userId || 'system'
        });

        this.saveRequests(requests);
        this.logAudit('status_change', requestId, oldStatus, newStatus, { note, userId });
        this.addNotification(request.customerId, requestId, newStatus, note);
        return request;
    },

    // --- Duplicate Detection ---

    findDuplicates(akid, marketName) {
        const requests = this.getRequests();
        return requests.filter(r =>
            r.akid === akid &&
            (r.marketName === marketName || r.customMarket === marketName) &&
            !['declined', 'expired'].includes(r.status)
        );
    },

    // --- Priority Calculation ---

    calculatePriority(request) {
        let priority = 0;
        let reasons = [];

        // VIP shop - check akid_meta if available
        const shop = (typeof getShopByAkid === 'function') ? getShopByAkid(request.akid) : null;
        if (shop && shop.vip) {
            priority += 3;
            reasons.push('VIP shop');
        }

        // Urgent - event starting soon
        if (request.eventTime) {
            const minutesUntilEvent = (new Date(request.eventTime) - new Date()) / 60000;
            if (minutesUntilEvent <= PRIORITY_RULES.urgentThresholdMinutes && minutesUntilEvent > 0) {
                priority += 5;
                reasons.push('Urgent - event starting soon');
            }
        }

        // High demand - same market requested multiple times
        const duplicates = this.findDuplicates(request.akid, request.marketName || request.customMarket);
        if (duplicates.length >= PRIORITY_RULES.highDemandThreshold) {
            priority += 2;
            reasons.push('High demand (' + duplicates.length + ' requests)');
        }

        return { score: priority, reasons };
    },

    // --- Notifications ---

    getNotifications(customerId) {
        const all = JSON.parse(localStorage.getItem(this.KEYS.NOTIFICATIONS) || '[]');
        return customerId ? all.filter(n => n.customerId === customerId) : all;
    },

    addNotification(customerId, requestId, status, note) {
        const notifications = JSON.parse(localStorage.getItem(this.KEYS.NOTIFICATIONS) || '[]');
        notifications.push({
            id: 'NOTIF-' + Date.now(),
            customerId,
            requestId,
            status,
            message: STATUS_LABELS[status] || 'Status updated.',
            note: note || '',
            timestamp: new Date().toISOString(),
            read: false
        });
        localStorage.setItem(this.KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    },

    markNotificationRead(notifId) {
        const notifications = JSON.parse(localStorage.getItem(this.KEYS.NOTIFICATIONS) || '[]');
        const notif = notifications.find(n => n.id === notifId);
        if (notif) {
            notif.read = true;
            localStorage.setItem(this.KEYS.NOTIFICATIONS, JSON.stringify(notifications));
        }
    },

    // --- Audit Log ---

    logAudit(action, requestId, fromStatus, toStatus, details) {
        const log = JSON.parse(localStorage.getItem(this.KEYS.AUDIT_LOG) || '[]');
        log.push({
            id: 'LOG-' + Date.now(),
            action,
            requestId,
            fromStatus,
            toStatus,
            details,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(this.KEYS.AUDIT_LOG, JSON.stringify(log));
    },

    getAuditLog(requestId) {
        const log = JSON.parse(localStorage.getItem(this.KEYS.AUDIT_LOG) || '[]');
        return requestId ? log.filter(l => l.requestId === requestId) : log;
    },

    // --- Statistics ---

    getStatistics() {
        const requests = this.getRequests();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const stats = {
            total: requests.length,
            today: requests.filter(r => new Date(r.submittedAt) >= today).length,
            byStatus: {},
            byShop: {},
            bySport: {},
            approvalRate: 0,
            declineRate: 0,
            avgReviewTime: 0,
            duplicateRate: 0
        };

        // By status
        requests.forEach(r => {
            stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
            stats.byShop[r.akid] = (stats.byShop[r.akid] || 0) + 1;
            const category = r.category || 'Other';
            stats.bySport[category] = (stats.bySport[category] || 0) + 1;
        });

        // Rates
        const resolved = requests.filter(r => ['approved', 'available', 'declined'].includes(r.status));
        if (resolved.length > 0) {
            const approved = resolved.filter(r => ['approved', 'available'].includes(r.status)).length;
            const declined = resolved.filter(r => r.status === 'declined').length;
            stats.approvalRate = Math.round((approved / resolved.length) * 100);
            stats.declineRate = Math.round((declined / resolved.length) * 100);
        }

        // Average review time (from submitted to first non-submitted status)
        const reviewed = requests.filter(r => r.statusHistory && r.statusHistory.length > 1);
        if (reviewed.length > 0) {
            const totalTime = reviewed.reduce((sum, r) => {
                const submitted = new Date(r.statusHistory[0].timestamp);
                const firstReview = new Date(r.statusHistory[1].timestamp);
                return sum + (firstReview - submitted);
            }, 0);
            stats.avgReviewTime = Math.round(totalTime / reviewed.length / 60000); // in minutes
        }

        // Most requested markets
        const marketCounts = {};
        requests.forEach(r => {
            const name = r.marketName || r.customMarket || 'Unknown';
            marketCounts[name] = (marketCounts[name] || 0) + 1;
        });
        stats.topMarkets = Object.entries(marketCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        return stats;
    },

    // --- Utility ---

    clearAll() {
        localStorage.removeItem(this.KEYS.REQUESTS);
        localStorage.removeItem(this.KEYS.AUDIT_LOG);
        localStorage.removeItem(this.KEYS.NOTIFICATIONS);
    },

    generateCustomerId() {
        let id = localStorage.getItem('customerId');
        if (!id) {
            id = 'CUST-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            localStorage.setItem('customerId', id);
        }
        return id;
    }
};
