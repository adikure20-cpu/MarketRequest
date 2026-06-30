const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data', 'requests.json');

// --- MIME Types ---
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// --- Data Store ---
function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading data file:', e.message);
    }
    return { requests: [], auditLog: [], notifications: [] };
}

function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing data file:', e.message);
    }
}

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
    writeData({ requests: [], auditLog: [], notifications: [] });
}

// --- Helpers ---
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function generateId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
}

// --- API Routes ---
async function handleAPI(req, res, urlPath, method) {
    // CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const data = readData();

    // GET /api/requests - get all requests (optional ?akid= filter)
    if (urlPath === '/api/requests' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const akid = url.searchParams.get('akid');
        const customerId = url.searchParams.get('customerId');
        const status = url.searchParams.get('status');

        let results = data.requests;
        if (akid) results = results.filter(r => r.akid === akid);
        if (customerId) results = results.filter(r => r.customerId === customerId);
        if (status) results = results.filter(r => r.status === status);

        return sendJSON(res, 200, results);
    }

    // GET /api/requests/:id
    if (urlPath.match(/^\/api\/requests\/[^/]+$/) && method === 'GET') {
        const id = urlPath.split('/').pop();
        const request = data.requests.find(r => r.id === id);
        if (!request) return sendJSON(res, 404, { error: 'Not found' });
        return sendJSON(res, 200, request);
    }

    // POST /api/requests - create a new request
    if (urlPath === '/api/requests' && method === 'POST') {
        const body = await parseBody(req);
        const request = {
            ...body,
            id: generateId('REQ'),
            submittedAt: new Date().toISOString(),
            status: 'submitted',
            lastUpdated: null,
            statusHistory: [{
                status: 'submitted',
                timestamp: new Date().toISOString(),
                note: 'Request submitted by customer'
            }]
        };
        data.requests.push(request);

        // Audit log
        data.auditLog.push({
            id: generateId('LOG'),
            action: 'request_created',
            requestId: request.id,
            fromStatus: null,
            toStatus: 'submitted',
            details: { akid: request.akid },
            timestamp: new Date().toISOString()
        });

        writeData(data);
        return sendJSON(res, 201, request);
    }

    // PATCH /api/requests/:id/status - update status
    if (urlPath.match(/^\/api\/requests\/[^/]+\/status$/) && method === 'PATCH') {
        const id = urlPath.split('/')[3];
        const body = await parseBody(req);
        const { status: newStatus, note, userId } = body;

        const request = data.requests.find(r => r.id === id);
        if (!request) return sendJSON(res, 404, { error: 'Not found' });

        const oldStatus = request.status;
        request.status = newStatus;
        request.lastUpdated = new Date().toISOString();
        request.statusHistory.push({
            status: newStatus,
            timestamp: new Date().toISOString(),
            note: note || '',
            userId: userId || 'system'
        });

        // Audit log
        data.auditLog.push({
            id: generateId('LOG'),
            action: 'status_change',
            requestId: request.id,
            fromStatus: oldStatus,
            toStatus: newStatus,
            details: { note, userId },
            timestamp: new Date().toISOString()
        });

        // Notification
        data.notifications.push({
            id: generateId('NOTIF'),
            customerId: request.customerId,
            requestId: request.id,
            status: newStatus,
            note: note || '',
            timestamp: new Date().toISOString(),
            read: false
        });

        writeData(data);
        return sendJSON(res, 200, request);
    }

    // GET /api/audit - get audit log
    if (urlPath === '/api/audit' && method === 'GET') {
        return sendJSON(res, 200, data.auditLog);
    }

    // GET /api/notifications?customerId=
    if (urlPath === '/api/notifications' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const customerId = url.searchParams.get('customerId');
        let results = data.notifications;
        if (customerId) results = results.filter(n => n.customerId === customerId);
        return sendJSON(res, 200, results);
    }

    // GET /api/stats - get statistics
    if (urlPath === '/api/stats' && method === 'GET') {
        const requests = data.requests;
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
            topMarkets: []
        };

        requests.forEach(r => {
            stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
            stats.byShop[r.akid] = (stats.byShop[r.akid] || 0) + 1;
            stats.bySport[r.category || 'Other'] = (stats.bySport[r.category || 'Other'] || 0) + 1;
        });

        const resolved = requests.filter(r => ['approved', 'available', 'declined'].includes(r.status));
        if (resolved.length > 0) {
            const approved = resolved.filter(r => ['approved', 'available'].includes(r.status)).length;
            const declined = resolved.filter(r => r.status === 'declined').length;
            stats.approvalRate = Math.round((approved / resolved.length) * 100);
            stats.declineRate = Math.round((declined / resolved.length) * 100);
        }

        const reviewed = requests.filter(r => r.statusHistory && r.statusHistory.length > 1);
        if (reviewed.length > 0) {
            const totalTime = reviewed.reduce((sum, r) => {
                const submitted = new Date(r.statusHistory[0].timestamp);
                const firstReview = new Date(r.statusHistory[1].timestamp);
                return sum + (firstReview - submitted);
            }, 0);
            stats.avgReviewTime = Math.round(totalTime / reviewed.length / 60000);
        }

        const marketCounts = {};
        requests.forEach(r => {
            const name = r.marketName || r.customMarket || 'Unknown';
            marketCounts[name] = (marketCounts[name] || 0) + 1;
        });
        stats.topMarkets = Object.entries(marketCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        return sendJSON(res, 200, stats);
    }

    // DELETE /api/data - clear all data
    if (urlPath === '/api/data' && method === 'DELETE') {
        writeData({ requests: [], auditLog: [], notifications: [] });
        return sendJSON(res, 200, { message: 'All data cleared' });
    }

    // POST /api/data/sample - generate sample data
    if (urlPath === '/api/data/sample' && method === 'POST') {
        const body = await parseBody(req);
        // Sample data generation delegated to client - accepts array of requests
        if (body.requests && Array.isArray(body.requests)) {
            body.requests.forEach(r => {
                r.id = generateId('REQ');
                r.submittedAt = r.submittedAt || new Date().toISOString();
                r.status = r.status || 'submitted';
                r.statusHistory = r.statusHistory || [{
                    status: 'submitted',
                    timestamp: r.submittedAt,
                    note: 'Request submitted'
                }];
                data.requests.push(r);
            });
            writeData(data);
        }
        return sendJSON(res, 201, { message: 'Sample data created', count: (body.requests || []).length });
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

    // Static files
    let filePath = path.join(__dirname, urlPath === '/' ? 'qr-display.html' : urlPath);
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
