const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize users table and seed admin
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'bookie',
                must_change_password BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                token VARCHAR(255) PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS requests (
                id VARCHAR(64) PRIMARY KEY,
                akid VARCHAR(64),
                customer_id VARCHAR(64),
                status VARCHAR(20),
                submitted_at TIMESTAMP DEFAULT NOW(),
                data JSONB NOT NULL
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id VARCHAR(64) PRIMARY KEY,
                request_id VARCHAR(64),
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(64) PRIMARY KEY,
                customer_id VARCHAR(64),
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shop_heartbeats (
                akid VARCHAR(64) PRIMARY KEY,
                last_seen TIMESTAMP DEFAULT NOW(),
                first_seen TIMESTAMP DEFAULT NOW(),
                hit_count INTEGER DEFAULT 1
            )
        `);
        // Seed admin user if not exists
        const bcrypt = require('bcryptjs');
        const adminEmail = 'adi.kuric@tipico.com';
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
        if (existing.rows.length === 0) {
            const hash = bcrypt.hashSync('B00Xware1!', 10);
            await pool.query(
                'INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4)',
                [adminEmail, hash, 'admin', true]
            );
            console.log('Seeded admin user:', adminEmail);
        }
        console.log('Database initialized');
    } catch (e) {
        console.error('DB init error:', e.message);
    }
}

module.exports = { pool, initDb };
