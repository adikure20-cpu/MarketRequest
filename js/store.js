const { pool } = require('./db.js');

function genId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
}

// --- Requests ---
async function getRequests(filters) {
    filters = filters || {};
    var conditions = [];
    var params = [];
    var idx = 1;
    if (filters.akid) { conditions.push('akid = $' + idx++); params.push(filters.akid); }
    if (filters.customerId) { conditions.push('customer_id = $' + idx++); params.push(filters.customerId); }
    if (filters.status) { conditions.push('status = $' + idx++); params.push(filters.status); }
    var where = conditions.length ? (' WHERE ' + conditions.join(' AND ')) : '';
    var result = await pool.query('SELECT data FROM requests' + where + ' ORDER BY submitted_at DESC', params);
    return result.rows.map(function(r){ return r.data; });
}

async function getRequestById(id) {
    var result = await pool.query('SELECT data FROM requests WHERE id = $1', [id]);
    return result.rows.length ? result.rows[0].data : null;
}

async function addRequest(request) {
    request.id = genId('REQ');
    request.submittedAt = new Date().toISOString();
    request.status = 'submitted';
    request.lastUpdated = null;
    request.statusHistory = [{
        status: 'submitted',
        timestamp: new Date().toISOString(),
        noteCode: 'note_submitted'
    }];
    await pool.query(
        'INSERT INTO requests (id, akid, customer_id, status, submitted_at, data) VALUES ($1,$2,$3,$4,$5,$6)',
        [request.id, request.akid || null, request.customerId || null, request.status, request.submittedAt, request]
    );
    // audit
    await addAudit({
        action: 'request_created',
        requestId: request.id,
        fromStatus: null,
        toStatus: 'submitted',
        details: { akid: request.akid },
        timestamp: new Date().toISOString()
    });
    return request;
}

async function saveRequest(request) {
    await pool.query('UPDATE requests SET akid=$2, customer_id=$3, status=$4, data=$5 WHERE id=$1',
        [request.id, request.akid || null, request.customerId || null, request.status, request]);
    return request;
}

async function findDuplicate(akid, marketName, eventName) {
    var reqs = await getRequests({ akid: akid });
    return reqs.find(function(r){
        return (r.marketName === marketName || r.customMarket === marketName) &&
            (r.eventName || '') === (eventName || '') &&
            !['declined','expired'].includes(r.status);
    });
}

// --- Audit ---
async function addAudit(entry) {
    entry.id = genId('LOG');
    await pool.query('INSERT INTO audit_log (id, request_id, data) VALUES ($1,$2,$3)',
        [entry.id, entry.requestId || null, entry]);
    return entry;
}
async function getAudit() {
    var result = await pool.query('SELECT data FROM audit_log ORDER BY created_at ASC');
    return result.rows.map(function(r){ return r.data; });
}

// --- Notifications ---
async function addNotification(notif) {
    notif.id = genId('NOTIF');
    await pool.query('INSERT INTO notifications (id, customer_id, data) VALUES ($1,$2,$3)',
        [notif.id, notif.customerId || null, notif]);
    return notif;
}
async function getNotifications(customerId) {
    if (customerId) {
        var r = await pool.query('SELECT data FROM notifications WHERE customer_id = $1 ORDER BY created_at ASC', [customerId]);
        return r.rows.map(function(x){ return x.data; });
    }
    var all = await pool.query('SELECT data FROM notifications ORDER BY created_at ASC');
    return all.rows.map(function(x){ return x.data; });
}

// --- Shop heartbeats ---
async function recordHeartbeat(akid) {
    if (!akid) return;
    await pool.query(
        'INSERT INTO shop_heartbeats (akid, last_seen, first_seen, hit_count) VALUES ($1, NOW(), NOW(), 1) ' +
        'ON CONFLICT (akid) DO UPDATE SET last_seen = NOW(), hit_count = shop_heartbeats.hit_count + 1',
        [akid]
    );
}
async function getHeartbeats() {
    var result = await pool.query('SELECT akid, last_seen, first_seen, hit_count FROM shop_heartbeats ORDER BY last_seen DESC');
    return result.rows;
}

// --- Clear (admin) ---
async function clearAll() {
    await pool.query('DELETE FROM requests');
    await pool.query('DELETE FROM audit_log');
    await pool.query('DELETE FROM notifications');
}

module.exports = {
    getRequests, getRequestById, addRequest, saveRequest, findDuplicate,
    addAudit, getAudit, addNotification, getNotifications,
    recordHeartbeat, getHeartbeats, clearAll, genId
};
