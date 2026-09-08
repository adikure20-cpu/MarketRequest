const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db.js');

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function login(email, password) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    if (!bcrypt.compareSync(password, user.password_hash)) return null;
    const token = generateToken();
    await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, user.id]);
    return {
        token: token,
        user: { id: user.id, email: user.email, role: user.role, mustChangePassword: user.must_change_password }
    };
}

async function getUserByToken(token) {
    if (!token) return null;
    const result = await pool.query(
        'SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = $1',
        [token]
    );
    if (result.rows.length === 0) return null;
    const u = result.rows[0];
    return { id: u.id, email: u.email, role: u.role, mustChangePassword: u.must_change_password };
}

async function logout(token) {
    if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

async function changePassword(userId, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, userId]);
}

async function createUser(email, role) {
    const hash = bcrypt.hashSync('B00Xware1!', 10); // default password
    try {
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
            [email.toLowerCase().trim(), hash, role, true]
        );
        return result.rows[0];
    } catch (e) {
        if (e.code === '23505') return { error: 'exists' }; // unique violation
        throw e;
    }
}

async function listUsers() {
    const result = await pool.query('SELECT id, email, role, must_change_password, created_at FROM users ORDER BY created_at');
    return result.rows;
}

async function deleteUser(userId) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

module.exports = { login, getUserByToken, logout, changePassword, createUser, listUsers, deleteUser };
