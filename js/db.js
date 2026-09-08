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
