const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const Validation = require('./js/validation.js');
const { initDb } = require('./js/db.js');
const auth = require('./js/auth.js');
const store = require('./js/store.js');
const shopsdb = require('./js/shopsdb.js');
const rateLimit = require('./js/ratelimit.js');
const akidMeta = require('./data/akid_meta.js');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// --- MIME Types ---
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

// --- Helpers ---
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        const MAX_BODY = 10 * 1024;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY) { reject(new Error('body_too_large')); req.destroy(); return; }
            body += chunk;
        });
        req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
        req.on('error', reject);
    });
}

function sendJSON(res, statusCode, data) {
    // CORS is intentionally left open (Access-Control-Allow-Origin: *).
    // Auth uses Bearer tokens stored in localStorage (not cookies), so a
    // cross-site page cannot read another origin's token and cannot forge
    // authenticated requests. There are no ambient credentials to steal.
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

function getToken(req) {
    // Check Authorization header first, then cookie
    var authHeader = req.headers['authorization'];
    if (authHeader && authHeader.indexOf('Bearer ') === 0) {
        return authHeader.substring(7);
    }
    var cookie = req.headers['cookie'] || '';
    var match = cookie.match(/authToken=([^;]+)/);
    return match ? match[1] : null;
}

function getClientIp(req) {
    var fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
}

// --- API Routes ---
async function handleAPI(req, res, urlPath, method) {
    // CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    // Rate limiting
    const ip = getClientIp(req);
    if (!rateLimit.checkLimit(ip, 'global', 120)) return sendJSON(res, 429, { error: 'rate_limit' });
    if (urlPath === '/api/requests' && method === 'POST') {
        if (!rateLimit.checkLimit(ip, 'create', 10)) return sendJSON(res, 429, { error: 'rate_limit' });
    }
    if (urlPath === '/api/auth/login' && method === 'POST') {
        if (!rateLimit.checkLimit(ip, 'login', 8)) return sendJSON(res, 429, { error: 'rate_limit' });
    }

    // GET /api/requests - get all requests (optional ?akid= filter)
    if (urlPath === '/api/requests' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filters = {
            akid: url.searchParams.get('akid'),
            customerId: url.searchParams.get('customerId'),
            status: url.searchParams.get('status')
        };
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser && !filters.akid && !filters.customerId) {
            return sendJSON(res, 403, { error: 'forbidden' });
        }
        const results = await store.getRequests(filters);
        return sendJSON(res, 200, results);
    }

    // GET /api/requests/:id
    if (urlPath.match(/^\/api\/requests\/[^/]+$/) && method === 'GET') {
        const id = urlPath.split('/').pop();
        const request = await store.getRequestById(id);
        if (!request) return sendJSON(res, 404, { error: 'Not found' });
        return sendJSON(res, 200, request);
    }

    // POST /api/requests - create a new request
    if (urlPath === '/api/requests' && method === 'POST') {
        const body = await parseBody(req);

        // Validate shop identifier
        if (!body.akid || !akidMeta.getShopByAkid(body.akid)) {
            return sendJSON(res, 400, { error: 'invalid_shop' });
        }

        // Validate & sanitize customer inputs
        var fieldsToCheck = [body.eventName, body.playerDetail, body.customMarket];
        for (var fi = 0; fi < fieldsToCheck.length; fi++) {
            if (fieldsToCheck[fi]) {
                var vr = Validation.validateInput(fieldsToCheck[fi]);
                if (!vr.valid) {
                    return sendJSON(res, 400, { error: 'invalid_input', reason: vr.reason });
                }
            }
        }
        // Sanitize
        if (body.eventName) body.eventName = Validation.sanitize(body.eventName);
        if (body.playerDetail) body.playerDetail = Validation.sanitize(body.playerDetail);
        if (body.customMarket) body.customMarket = Validation.sanitize(body.customMarket);

        // Duplicate check - same shop + same market + same event
        const marketCheck = body.marketName || body.customMarket || '';
        if (marketCheck) {
            const existing = await store.findDuplicate(body.akid, marketCheck, body.eventName);
            if (existing) {
                return sendJSON(res, 409, {
                    error: 'duplicate',
                    status: existing.status,
                    message: 'Request already exists',
                    existingId: existing.id
                });
            }
        }

        const request = await store.addRequest(body);
        return sendJSON(res, 201, request);
    }

    // PATCH /api/requests/:id/status - update status
    if (urlPath.match(/^\/api\/requests\/[^/]+\/status$/) && method === 'PATCH') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser) return sendJSON(res, 401, { error: 'unauthorized' });
        if (authUser.role !== 'bookie') return sendJSON(res, 403, { error: 'admin_cannot_approve' });
        const id = urlPath.split('/')[3];
        const body = await parseBody(req);
        const request = await store.getRequestById(id);
        if (!request) return sendJSON(res, 404, { error: 'Not found' });

        // Skip if status is already the same
        if (request.status === body.status) {
            return sendJSON(res, 200, request);
        }

        const oldStatus = request.status;
        request.status = body.status;
        request.lastUpdated = new Date().toISOString();
        request.statusHistory = request.statusHistory || [];
        request.statusHistory.push({
            status: body.status,
            timestamp: new Date().toISOString(),
            noteCode: body.noteCode || null,
            declineReason: body.declineReason || null,
            noteText: body.noteText || null,
            note: body.note || null,
            userId: body.userId || 'system'
        });

        await store.saveRequest(request);

        // Audit log
        await store.addAudit({
            action: 'status_change',
            requestId: request.id,
            fromStatus: oldStatus,
            toStatus: body.status,
            details: { noteCode: body.noteCode, declineReason: body.declineReason, userId: body.userId },
            timestamp: new Date().toISOString()
        });

        // Notification
        await store.addNotification({
            customerId: request.customerId,
            requestId: request.id,
            status: body.status,
            noteCode: body.noteCode || null,
            timestamp: new Date().toISOString(),
            read: false
        });

        return sendJSON(res, 200, request);
    }

    // PATCH /api/requests/:id - update request fields (e.g. playerDetail)
    if (urlPath.match(/^\/api\/requests\/[^/]+$/) && method === 'PATCH') {
        const id = urlPath.split('/').pop();
        const body = await parseBody(req);
        const request = await store.getRequestById(id);
        if (!request) return sendJSON(res, 404, { error: 'Not found' });

        // Update allowed fields
        if (body.playerDetail !== undefined) request.playerDetail = body.playerDetail;
        if (body.eventName !== undefined) request.eventName = body.eventName;
        if (body.marketName !== undefined) request.marketName = body.marketName;
        if (body.visibleUntil !== undefined) request.visibleUntil = body.visibleUntil;
        request.lastUpdated = new Date().toISOString();

        await store.saveRequest(request);
        return sendJSON(res, 200, request);
    }

    // GET /api/audit - get audit log
    if (urlPath === '/api/audit' && method === 'GET') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser) return sendJSON(res, 401, { error: 'unauthorized' });
        return sendJSON(res, 200, await store.getAudit());
    }

    // GET /api/notifications?customerId=
    if (urlPath === '/api/notifications' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        return sendJSON(res, 200, await store.getNotifications(url.searchParams.get('customerId')));
    }

    // POST /api/heartbeat - shop display pings that it's active
    if (urlPath === '/api/heartbeat' && method === 'POST') {
        const body = await parseBody(req);
        if (body.akid && akidMeta.getShopByAkid(body.akid)) {
            await store.recordHeartbeat(body.akid);
        }
        return sendJSON(res, 200, { ok: true });
    }

    // GET /api/heartbeats - list shop activity (for stats)
    if (urlPath === '/api/heartbeats' && method === 'GET') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser) return sendJSON(res, 401, { error: 'unauthorized' });
        return sendJSON(res, 200, await store.getHeartbeats());
    }

    // GET /api/stats - get statistics
    if (urlPath === '/api/stats' && method === 'GET') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser) return sendJSON(res, 401, { error: 'unauthorized' });
        const requests = await store.getRequests({});
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const stats = {
            total: requests.length,
            today: 0,
            byStatus: {},
            byShop: {},
            bySport: {},
            approvalRate: 0,
            declineRate: 0,
            avgReviewTime: 0,
            topMarkets: []
        };

        requests.forEach(function(r){
            if (new Date(r.submittedAt) >= today) stats.today++;
            stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
            stats.byShop[r.akid] = (stats.byShop[r.akid] || 0) + 1;
            stats.bySport[r.category || 'Other'] = (stats.bySport[r.category || 'Other'] || 0) + 1;
        });

        const resolved = requests.filter(function(r){ return ['approved', 'available', 'declined'].includes(r.status); });
        if (resolved.length) {
            const approved = resolved.filter(function(r){ return ['approved', 'available'].includes(r.status); }).length;
            const declined = resolved.filter(function(r){ return r.status === 'declined'; }).length;
            stats.approvalRate = Math.round((approved / resolved.length) * 100);
            stats.declineRate = Math.round((declined / resolved.length) * 100);
        }

        const reviewed = requests.filter(function(r){ return r.statusHistory && r.statusHistory.length > 1; });
        if (reviewed.length) {
            const total = reviewed.reduce(function(sum, r){ return sum + (new Date(r.statusHistory[1].timestamp) - new Date(r.statusHistory[0].timestamp)); }, 0);
            stats.avgReviewTime = Math.round(total / reviewed.length / 60000);
        }

        const marketCounts = {};
        requests.forEach(function(r){ var n = r.marketName || r.customMarket || 'Unknown'; marketCounts[n] = (marketCounts[n] || 0) + 1; });
        stats.topMarkets = Object.entries(marketCounts).sort(function(a, b){ return b[1] - a[1]; }).slice(0, 10).map(function(e){ return { name: e[0], count: e[1] }; });

        return sendJSON(res, 200, stats);
    }

    // DELETE /api/data - clear all data (admin only)
    if (urlPath === '/api/data' && method === 'DELETE') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser || authUser.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        await store.clearAll();
        return sendJSON(res, 200, { message: 'All data cleared' });
    }

    // POST /api/data/sample - generate sample data
    if (urlPath === '/api/data/sample' && method === 'POST') {
        const body = await parseBody(req);
        if (body.requests && Array.isArray(body.requests)) {
            for (var si = 0; si < body.requests.length; si++) {
                await store.addRequest(body.requests[si]);
            }
        }
        return sendJSON(res, 201, { message: 'Sample data created', count: (body.requests || []).length });
    }

    // POST /api/auth/login
    if (urlPath === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        try {
            const result = await auth.login(body.email || '', body.password || '');
            if (!result) return sendJSON(res, 401, { error: 'invalid_credentials' });
            return sendJSON(res, 200, result);
        } catch (e) {
            return sendJSON(res, 500, { error: 'server_error' });
        }
    }

    // POST /api/auth/logout
    if (urlPath === '/api/auth/logout' && method === 'POST') {
        const token = getToken(req);
        await auth.logout(token);
        return sendJSON(res, 200, { ok: true });
    }

    // GET /api/auth/me - current user
    if (urlPath === '/api/auth/me' && method === 'GET') {
        const token = getToken(req);
        const user = await auth.getUserByToken(token);
        if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
        return sendJSON(res, 200, user);
    }

    // POST /api/auth/change-password
    if (urlPath === '/api/auth/change-password' && method === 'POST') {
        const token = getToken(req);
        const user = await auth.getUserByToken(token);
        if (!user) return sendJSON(res, 401, { error: 'unauthorized' });
        const body = await parseBody(req);
        if (!body.newPassword || body.newPassword.length < 8) {
            return sendJSON(res, 400, { error: 'weak_password' });
        }
        await auth.changePassword(user.id, body.newPassword);
        return sendJSON(res, 200, { ok: true });
    }

    // GET /api/shops/diag - diagnostic (admin only)
    if (urlPath === '/api/shops/diag' && method === 'GET') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser || authUser.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const diag = { hasEnvVar: !!process.env.SHOPS_DATABASE_URL, poolExists: !!shopsdb.shopsPool, partnerCount: null, shopCount: null, sampleRow: null, error: null };
        try {
            if (shopsdb.shopsPool) {
                const cnt = await shopsdb.shopsPool.query('SELECT COUNT(*) AS c FROM akid_meta');
                diag.shopCount = cnt.rows[0].c;
                const pc = await shopsdb.shopsPool.query("SELECT COUNT(DISTINCT parent_accountname) AS c FROM akid_meta");
                diag.partnerCount = pc.rows[0].c;
                const sample = await shopsdb.shopsPool.query('SELECT akid, accountname, parent_accountname, type FROM akid_meta LIMIT 1');
                diag.sampleRow = sample.rows[0] || null;
            }
        } catch (e) {
            diag.error = e.message;
        }
        return sendJSON(res, 200, diag);
    }
    // GET /api/shops/partners?search= (admin only)
    if (urlPath === '/api/shops/partners' && method === 'GET') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser || authUser.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const url = new URL(req.url, `http://${req.headers.host}`);
        try { return sendJSON(res, 200, await shopsdb.getPartners(url.searchParams.get('search'))); }
        catch (e) { return sendJSON(res, 500, { error: 'shops_db_error' }); }
    }
    // GET /api/shops?partner=&search= (admin only) - includes activation status
    if (urlPath === '/api/shops' && method === 'GET') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser || authUser.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const url = new URL(req.url, `http://${req.headers.host}`);
        try {
            const shops = await shopsdb.getShops(url.searchParams.get('partner'), url.searchParams.get('search'));
            const activationMap = await store.getActivationMap();
            shops.forEach(function(s){ s.activated = activationMap[s.akid] === true; });
            return sendJSON(res, 200, shops);
        } catch (e) { return sendJSON(res, 500, { error: 'shops_db_error' }); }
    }
    // POST /api/shops/activate (admin only)
    if (urlPath === '/api/shops/activate' && method === 'POST') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser || authUser.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const body = await parseBody(req);
        if (!body.akid) return sendJSON(res, 400, { error: 'missing_akid' });
        await store.activateShop(body.akid, body.accountname, body.parent_accountname, authUser.email);
        return sendJSON(res, 200, { ok: true });
    }
    // POST /api/shops/deactivate (admin only)
    if (urlPath === '/api/shops/deactivate' && method === 'POST') {
        const authUser = await auth.getUserByToken(getToken(req));
        if (!authUser || authUser.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const body = await parseBody(req);
        if (!body.akid) return sendJSON(res, 400, { error: 'missing_akid' });
        await store.deactivateShop(body.akid);
        return sendJSON(res, 200, { ok: true });
    }
    // GET /api/shops/check?akid= (PUBLIC) - is shop activated for display?
    if (urlPath === '/api/shops/check' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const akid = url.searchParams.get('akid');
        if (!akid) return sendJSON(res, 400, { error: 'missing_akid' });
        const activated = await store.isShopActivated(akid);
        var shopInfo = null;
        if (activated) { try { shopInfo = await shopsdb.getShopByAkid(akid); } catch(e){} }
        return sendJSON(res, 200, { activated: activated, shop: shopInfo });
    }

    // GET /api/users - list users (admin only)
    if (urlPath === '/api/users' && method === 'GET') {
        const token = getToken(req);
        const user = await auth.getUserByToken(token);
        if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const users = await auth.listUsers();
        return sendJSON(res, 200, users);
    }

    // POST /api/users - create user (admin only)
    if (urlPath === '/api/users' && method === 'POST') {
        const token = getToken(req);
        const user = await auth.getUserByToken(token);
        if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const body = await parseBody(req);
        if (!body.email || !body.role) return sendJSON(res, 400, { error: 'missing_fields' });
        if (body.role !== 'admin' && body.role !== 'bookie') return sendJSON(res, 400, { error: 'invalid_role' });
        const result = await auth.createUser(body.email, body.role);
        if (result.error === 'exists') return sendJSON(res, 409, { error: 'user_exists' });
        return sendJSON(res, 201, result);
    }

    // POST /api/users/:id/reset-password - reset a user's password to default (admin only)
    if (urlPath.match(/^\/api\/users\/[0-9]+\/reset-password$/) && method === 'POST') {
        const token = getToken(req);
        const user = await auth.getUserByToken(token);
        if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const uid = parseInt(urlPath.split('/')[3]);
        await auth.resetUserPassword(uid);
        return sendJSON(res, 200, { ok: true });
    }

    // DELETE /api/users/:id - delete user (admin only)
    if (urlPath.match(/^\/api\/users\/[0-9]+$/) && method === 'DELETE') {
        const token = getToken(req);
        const user = await auth.getUserByToken(token);
        if (!user || user.role !== 'admin') return sendJSON(res, 403, { error: 'forbidden' });
        const uid = parseInt(urlPath.split('/').pop());
        if (uid === user.id) return sendJSON(res, 400, { error: 'cannot_delete_self' });
        await auth.deleteUser(uid);
        return sendJSON(res, 200, { ok: true });
    }

    return sendJSON(res, 404, { error: 'API endpoint not found' });
}

// --- Server ---
const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    const method = req.method;

    // API routes
    if (urlPath.startsWith('/api/')) {
        try {
            await handleAPI(req, res, urlPath, method);
        } catch (e) {
            console.error('API Error:', e);
            sendJSON(res, 500, { error: 'Internal server error' });
        }
        return;
    }

    // GET /qr?data=URL - Generate QR code as PNG image
    if (urlPath === '/qr' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const qrData = url.searchParams.get('data');
        if (!qrData) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing data parameter');
            return;
        }
        if (qrData.length > 512) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Data too long');
            return;
        }
        try {
            const buffer = await QRCode.toBuffer(qrData, {
                width: 220,
                margin: 1,
                color: { dark: '#1a1a1a', light: '#ffffff' }
            });
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(buffer);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('QR generation failed');
        }
        return;
    }

    // Static files
    var relPath = urlPath.replace(/^\//, '');
    var blocked = ['js/db.js', 'js/auth.js', 'js/store.js', 'js/shopsdb.js', 'js/ratelimit.js', 'server.js', 'package.json', 'package-lock.json'];
    if (blocked.indexOf(relPath) !== -1) {
        res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return;
    }
    let filePath = path.join(__dirname, decodeURIComponent(urlPath === '/' ? 'qr-display.html' : urlPath));
    if (filePath.indexOf(__dirname) !== 0) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

initDb();

server.listen(PORT, HOST, () => {
    const base = `http://localhost:${PORT}`;

    console.log('');
    console.log('==============================================');
    console.log('  🎯 Market Request System - Running');
    console.log('==============================================');
    console.log('');
    console.log('  Pages:');
    console.log('');
    console.log(`  📺 QR Display (Shop Screen):`);
    console.log(`     ${base}/qr-display.html?akid=151111`);
    console.log('');
    console.log(`  📱 Customer Request (Mobile):`);
    console.log(`     ${base}/customer.html?akid=151111`);
    console.log('');
    console.log(`  🎛️  Bookie Dashboard:`);
    console.log(`     ${base}/bookie-dashboard.html`);
    console.log('');
    console.log('  API:');
    console.log(`     ${base}/api/requests`);
    console.log(`     ${base}/api/stats`);
    console.log(`     ${base}/api/audit`);
    console.log('');
    console.log('==============================================');
    console.log('  Press Ctrl+C to stop');
    console.log('==============================================');
    console.log('');
});
