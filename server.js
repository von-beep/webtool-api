const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'nexus',
  password: process.env.DB_PASSWORD || '/yIf[/h0O*.Gmwf/',
  database: process.env.DB_NAME || 'nexus_portal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

// Initialize database
async function initDatabase() {
  try {
    db = await mysql.createPool(dbConfig);
    const connection = await db.getConnection(); // Test the connection
    console.log('Database connection pool created successfully.');
    connection.release();
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
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await db.execute(
      'INSERT INTO users (id, email, password, fullName, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, hashedPassword, fullName, role, 'active']
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
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    if (!password) {
      return res.status(400).json({ error: 'Password cannot be empty' });
    }
    await db.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.params.id]
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
      'INSERT INTO users (id, email, password, fullName, role, status, leaveCredits) VALUES (?, ?, ?, ?, ?, ?, ?)', // Assuming pending_users also stores hashed password
      [user.id, user.email, user.password, user.fullName, user.role, 'active', 20] // The password from pending_users should already be hashed
    );

    // Remove from pending
    await connection.execute('DELETE FROM pending_users WHERE id = ?', [userId]);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to approve user' });
  } finally {
    connection.release();
  }
});

// Add pending user
app.post('/api/pending-users', async (req, res) => {
  try {
    const { id, email, password, fullName, role } = req.body;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await db.execute(
      'INSERT INTO pending_users (id, email, password, fullName, role) VALUES (?, ?, ?, ?, ?)',
      [id, email, hashedPassword, fullName, role]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add pending user' });
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


app.put('/api/holiday-requests/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await db.execute(
      'UPDATE holiday_requests SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update holiday request:', error);
    res.status(500).json({ error: 'Failed to update holiday request' });
  }
});

// Add leave application
app.post('/api/leave-applications', async (req, res) => {
  try {
    const { id, userEmail, userName, leaveType, startDate, endDate, details, status, timestamp } = req.body;
    await db.execute(
      'INSERT INTO leave_applications (id, userEmail, userName, leaveType, startDate, endDate, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userEmail, userName, leaveType, startDate, endDate, details, status, timestamp]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to add leave application:', error);
    res.status(500).json({ error: 'Failed to add leave application' });
  }
});

// Update leave application status
app.put('/api/leave-applications/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { status } = req.body;
    const { id } = req.params;
    
    // Get the current state of the application before updating
    const [applications] = await connection.execute('SELECT * FROM leave_applications WHERE id = ?', [id]);
    if (applications.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Leave application not found' });
    }
    const currentApplication = applications[0];
    const previousStatus = currentApplication.status;

    // Only perform credit logic if the status is actually changing
    if (previousStatus !== status) {
      const startDate = new Date(currentApplication.startDate);
      const endDate = new Date(currentApplication.endDate);
      const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // Case 1: Moving TO approved (from pending/denied) -> Deduct credits
      if (status === 'approved') {
        await connection.execute('UPDATE users SET leaveCredits = leaveCredits - ? WHERE email = ?', [duration, currentApplication.userEmail]);
      } 
      // Case 2: Moving FROM approved (to pending/denied) -> Refund credits
      else if (previousStatus === 'approved') {
        await connection.execute('UPDATE users SET leaveCredits = leaveCredits + ? WHERE email = ?', [duration, currentApplication.userEmail]);
      }
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

// Delete leave application
app.delete('/api/leave-applications/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;

    // Get the application to check its status and user email before deleting
    const [applications] = await connection.execute('SELECT * FROM leave_applications WHERE id = ?', [id]);
    if (applications.length === 0) {
      await connection.rollback();
      // It's not an error if it's already gone, so we can just succeed.
      return res.json({ success: true, message: 'Application not found, but considering it deleted.' });
    }
    const applicationToDelete = applications[0];

    // If the application was approved, refund the leave credits
    if (applicationToDelete.status === 'approved') {
      const startDate = new Date(applicationToDelete.startDate);
      const endDate = new Date(applicationToDelete.endDate);
      const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      await connection.execute('UPDATE users SET leaveCredits = leaveCredits + ? WHERE email = ?', [duration, applicationToDelete.userEmail]);
    }

    await connection.execute('DELETE FROM leave_applications WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to delete leave application:', error);
    res.status(500).json({ error: 'Failed to delete leave application' });
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
      
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

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