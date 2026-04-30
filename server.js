const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nexus_portal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

// Initialize database
async function initDatabase() {
  console.log('Attempting to connect to database...');
  try {
    db = await mysql.createPool(dbConfig);
    await db.getConnection(); // Test the connection
    console.log('Database connection successful.');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        fullName VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        status ENUM('active', 'disabled') DEFAULT 'active',
        leaveCredits INT DEFAULT 20,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS pending_users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        fullName VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userEmail VARCHAR(255) NOT NULL,
        userName VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        timestamp VARCHAR(255) NOT NULL,
        image TEXT,
        location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS holiday_requests (
        id VARCHAR(36) PRIMARY KEY,
        userEmail VARCHAR(255) NOT NULL,
        userName VARCHAR(255) NOT NULL,
        holidayName VARCHAR(255) NOT NULL,
        holidayDate DATE NOT NULL,
        details TEXT,
        status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
        timestamp VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS leave_applications (
        id VARCHAR(36) PRIMARY KEY,
        userEmail VARCHAR(255) NOT NULL,
        userName VARCHAR(255) NOT NULL,
        leaveType VARCHAR(255) NOT NULL,
        startDate DATE NOT NULL,
        endDate DATE NOT NULL,
        details TEXT,
        status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
        timestamp VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Tables are ready.');
  } catch (error) {
    console.error('FATAL: Database initialization failed:', error);
    process.exit(1); // Exit the process if DB connection fails
  }
}

// API Routes

// Get all data
app.get('/api/data', async (req, res) => {
  try {
    const [users] = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
    const [pendingUsers] = await db.execute('SELECT * FROM pending_users ORDER BY created_at DESC');
    const [logs] = await db.execute('SELECT * FROM logs ORDER BY created_at DESC');
    const [holidayRequests] = await db.execute('SELECT * FROM holiday_requests ORDER BY created_at DESC');
    const [leaveApplications] = await db.execute('SELECT * FROM leave_applications ORDER BY created_at DESC');

    res.json({
      users,
      pendingUsers,
      logs,
      holidayRequests,
      leaveApplications
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Add user
app.post('/api/users', async (req, res) => {
  try {
    const { id, email, password, fullName, role } = req.body;
    await db.execute(
      'INSERT INTO users (id, email, password, fullName, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, password, fullName, role, 'active']
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Update user status
app.put('/api/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await db.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Reset user password
app.put('/api/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password cannot be empty' });
    }
    await db.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [password, req.params.id]
    );
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Remove user from pending and add to users
app.post('/api/approve-user', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { userId } = req.body;
    const [users] = await connection.execute('SELECT * FROM pending_users WHERE id = ?', [userId]);
    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];


    // Add to users
    await connection.execute(
      'INSERT INTO users (id, email, password, fullName, role, status, leaveCredits) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.email, user.password, user.fullName, user.role, 'active', 20]
    );

    // Remove from pending
    await connection.execute('DELETE FROM pending_users WHERE id = ?', [userId]);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
// Add pending user
app.post('/api/pending-users', async (req, res) => {
  try {
    const { id, email, password, fullName, role } = req.body;
    await db.execute(
      'INSERT INTO pending_users (id, email, password, fullName, role) VALUES (?, ?, ?, ?, ?)',
      [id, email, password, fullName, role]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add pending user' });
  }
});
  } finally {
    connection.release();
  }
});

// Deny user
app.delete('/api/pending-users/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM pending_users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to deny user' });
  }
});

// Add log
app.post('/api/logs', async (req, res) => {
  try {
    const { userEmail, userName, type, timestamp, image, location } = req.body;
    await db.execute(
      'INSERT INTO logs (userEmail, userName, type, timestamp, image, location) VALUES (?, ?, ?, ?, ?, ?)',
      [userEmail, userName, type, timestamp, image, location]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add log' });
  }
});

// Add holiday request
app.post('/api/holiday-requests', async (req, res) => {
  try {
    const { id, userEmail, userName, holidayName, holidayDate, details, status, timestamp } = req.body;
    await db.execute(
      'INSERT INTO holiday_requests (id, userEmail, userName, holidayName, holidayDate, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userEmail, userName, holidayName, holidayDate, details, status, timestamp]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add holiday request' });
  }
});

// Delete holiday request
app.delete('/api/holiday-requests/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM holiday_requests WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete holiday request' });
  }
});




// Update holiday request status
app.put('/api/holiday-requests/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await db.execute(
      'UPDATE holiday_requests SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update holiday request' });
  }
});

// Update leave application status
app.put('/api/leave-applications/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { status } = req.body;
    const { id } = req.params;

    if (status === 'approved') {
      const [applications] = await connection.execute('SELECT * FROM leave_applications WHERE id = ?', [id]);
      if (applications.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Leave application not found' });
      }
      const application = applications[0];

      const [users] = await connection.execute('SELECT * FROM users WHERE email = ?', [application.userEmail]);
      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'User not found' });
      }
      const user = users[0];

      const startDate = new Date(application.startDate);
      const endDate = new Date(application.endDate);
      const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      if (user.leaveCredits < duration) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient leave credits' });
      }

      await connection.execute('UPDATE users SET leaveCredits = leaveCredits - ? WHERE id = ?', [duration, user.id]);
    }

    await connection.execute(
      'UPDATE leave_applications SET status = ? WHERE id = ?',
      [status, id]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to update leave application:', error);
    res.status(500).json({ error: 'Failed to update leave application' });
  } finally {
    connection.release();
  }
});

// Update user leave credits
app.put('/api/users/:id/leave-credits', async (req, res) => {
  try {
    const { credits } = req.body;
    await db.execute(
      'UPDATE users SET leaveCredits = ? WHERE id = ?',
      [credits, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update leave credits' });
  }
});

// Authenticate user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length > 0) {
      const user = users[0];
      if (user.status === 'disabled') {
        return res.status(403).json({ error: 'Your account has been disabled.' });
      }
      if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
      res.json({ success: true, user: user });
    } else {
      // Check pending users
      const [pending] = await db.execute(
        'SELECT * FROM pending_users WHERE email = ?',
        [email]
      );
      if (pending.length > 0) {
        res.status(403).json({ error: 'Account pending approval' });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Start server
async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();