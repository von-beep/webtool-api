const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

// --- Database Connection Configuration ---
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'nexus',
  password: process.env.DB_PASSWORD || '/yIf[/h0O*.Gmwf/',
  database: process.env.DB_NAME || 'nexus_portal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

/**
 * Checks if a given string is a bcrypt hash.
 * @param {string} str The string to check.
 * @returns {boolean} True if it is a bcrypt hash.
 */
function isBcryptHash(str) {
  // bcrypt hashes have a specific format: $2a$, $2b$, or $2y$, followed by a cost factor, '$', and 53 more characters.
  const bcryptRegex = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
  return typeof str === 'string' && bcryptRegex.test(str);
}

/**
 * Fetches users, hashes their passwords if they are in plaintext, and updates the database.
 * @param {mysql.PoolConnection} connection The database connection.
 * @param {string} tableName The name of the table to process ('users' or 'pending_users').
 */
async function hashPasswordsForTable(connection, tableName) {
  console.log(`\nChecking for plaintext passwords in '${tableName}' table...`);
  const [users] = await connection.execute(`SELECT id, email, password FROM ${tableName}`);

  if (users.length === 0) {
    console.log(`No users found in '${tableName}'.`);
    return;
  }

  let updatedCount = 0;
  const saltRounds = 10;

  for (const user of users) {
    if (user.password && !isBcryptHash(user.password)) {
      console.log(`- Hashing password for user: ${user.email}`);
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);
      await connection.execute(`UPDATE ${tableName} SET password = ? WHERE id = ?`, [hashedPassword, user.id]);
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    console.log(`✅ Successfully updated ${updatedCount} passwords in '${tableName}'.`);
  } else {
    console.log(`No plaintext passwords found in '${tableName}'. All passwords seem to be hashed.`);
  }
}

/**
 * Main function to run the password hashing process.
 */
async function updatePasswordsToHash() {
  let pool;
  try {
    console.log('Connecting to MySQL database...');
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log('Database connection successful.');

    await hashPasswordsForTable(connection, 'users');
    await hashPasswordsForTable(connection, 'pending_users');

    connection.release();
    console.log('\nPassword hashing process completed successfully!');
  } catch (error) {
    console.error('An error occurred during the password hashing process:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('Database pool closed.');
    }
  }
}

updatePasswordsToHash();