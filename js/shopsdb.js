const { Pool } = require('pg');
const shopsPool = process.env.SHOPS_DATABASE_URL ? new Pool({
    connectionString: process.env.SHOPS_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}) : null;

async function getPartners(search) {
    if (!shopsPool) return [];
    var sql = "SELECT DISTINCT parent_accountname FROM akid_meta WHERE parent_accountname IS NOT NULL AND parent_accountname <> ''";
    var params = [];
    if (search) { sql += " AND LOWER(parent_accountname) LIKE $1"; params.push('%' + search.toLowerCase() + '%'); }
    sql += " ORDER BY parent_accountname LIMIT 300";
    var result = await shopsPool.query(sql, params);
    return result.rows.map(function(r){ return r.parent_accountname; });
}

async function getShops(partner, search) {
    if (!shopsPool) return [];
    var conditions = [];
    var params = [];
    var idx = 1;
    if (partner) { conditions.push('parent_accountname = $' + idx++); params.push(partner); }
    if (search) {
        conditions.push('(LOWER(akid) LIKE $' + idx + ' OR LOWER(accountname) LIKE $' + idx + ' OR LOWER(COALESCE(address,\'\')) LIKE $' + idx + ')');
        params.push('%' + search.toLowerCase() + '%');
        idx++;
    }
    var where = conditions.length ? (' WHERE ' + conditions.join(' AND ')) : '';
    var sql = 'SELECT akid, accountname, parent_accountname, type, address, bundesland FROM akid_meta' + where + ' ORDER BY accountname LIMIT 500';
    var result = await shopsPool.query(sql, params);
    return result.rows;
}

async function getShopByAkid(akid) {
    if (!shopsPool) return null;
    var result = await shopsPool.query('SELECT akid, accountname, parent_accountname, type, address, bundesland FROM akid_meta WHERE akid = $1', [akid]);
    return result.rows.length ? result.rows[0] : null;
}

if (!shopsPool) {
    console.warn('SHOPS_DATABASE_URL not set - shop activation features disabled');
} else {
    shopsPool.query('SELECT 1').then(function(){ console.log('Shops DB connected'); }).catch(function(e){ console.error('Shops DB connection error:', e.message); });
}

module.exports = { getPartners, getShops, getShopByAkid, shopsPool };
