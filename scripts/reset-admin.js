// Usage: node scripts/reset-admin.js <email> <newPassword>
// Requires DATABASE_URL env var to be set.
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
    console.error('Usage: node scripts/reset-admin.js <email> <newPassword>');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async function() {
    try {
        const hash = bcrypt.hashSync(newPassword, 10);
        const result = await pool.query(
            'UPDATE users SET password_hash = $1, must_change_password = true WHERE email = $2 RETURNING id, email, role',
            [hash, email.toLowerCase().trim()]
        );
        if (result.rows.length === 0) {
            // User does not exist - create as admin
            await pool.query(
                'INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4)',
                [email.toLowerCase().trim(), hash, 'admin', true]
            );
            console.log('Created new admin user:', email);
        } else {
            console.log('Password reset for:', result.rows[0].email, '(role:', result.rows[0].role + ')');
        }
        await pool.end();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
})();
