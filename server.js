const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// --- WebSocket Setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// MySQL Connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'nexus',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'nexus_portal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// --- CORS Configuration ---
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : [];
console.log("von CORS_ALLOWED_ORIGINS:", allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      // Log the blocked origin for easier debugging
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // Allow cookies and authorization headers
};

app.use(cors(corsOptions));
// Handle pre-flight requests for all routes
app.options('*', cors(corsOptions));


let db;

// Initialize database
async function initDatabase() {
  // Dynamically import the createTables function from migrate.js
  const { createTables } = await import('./migrate.js');

  try {
    db = await mysql.createPool(dbConfig);
    const connection = await db.getConnection(); // Test the connection
    console.log('Database connection pool created successfully.');
    await createTables(connection); // Ensure tables exist
    connection.release();

  } catch (error) {
    console.error('FATAL: Database initialization failed:', error);
    process.exit(1); // Exit the process if DB connection fails
  }
}

const heartbeatInterval = 30000; // 30 seconds

wss.on('connection', ws => {
  console.log('Client connected to WebSocket');
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
});

wss.on('close', () => {
  clearInterval(interval);
});

function broadcastDataChange() {
  console.log('Broadcasting data change to all clients...');
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify({ type: 'data-changed' }));
  });
}

// API Routes

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const [users] = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all pending users
app.get('/api/pending-users', async (req, res) => {
  try {
    const [pendingUsers] = await db.execute('SELECT * FROM pending_users ORDER BY created_at DESC');
    res.json(pendingUsers);
  } catch (error) {
    console.error('Failed to fetch pending users:', error);
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

// Get all logs
app.get('/api/logs', async (req, res) => {
  try {
    const [logs] = await db.execute('SELECT * FROM logs ORDER BY timestamp DESC');
    res.json(logs);
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Get all holiday requests
app.get('/api/holiday-requests', async (req, res) => {
  try {
    const [holidayRequests] = await db.execute('SELECT * FROM holiday_requests ORDER BY timestamp DESC');
    res.json(holidayRequests);
  } catch (error) {
    console.error('Failed to fetch holiday requests:', error);
    res.status(500).json({ error: 'Failed to fetch holiday requests' });
  }
});

// Get all leave applications
app.get('/api/leave-applications', async (req, res) => {
  try {
    const [leaveApplications] = await db.execute('SELECT * FROM leave_applications ORDER BY timestamp DESC');
    res.json(leaveApplications);
  } catch (error) {
    console.error('Failed to fetch leave applications:', error);
    res.status(500).json({ error: 'Failed to fetch leave applications' });
  }
});

// Get all password reset requests
app.get('/api/password-reset-requests', async (req, res) => {
  try {
    const [passwordResetRequests] = await db.execute('SELECT * FROM password_reset_requests ORDER BY timestamp DESC');
    res.json(passwordResetRequests);
  } catch (error) {
    console.error('Failed to fetch password reset requests:', error);
    res.status(500).json({ error: 'Failed to fetch password reset requests' });
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
    broadcastDataChange();
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
    broadcastDataChange();
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
    // When a user resets their own password, turn off the 'must_change_password' flag
    await db.execute(
      'UPDATE users SET must_change_password = FALSE WHERE id = ?', [req.params.id]
    );
    await db.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.params.id]
    );
    broadcastDataChange();
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

    // Check if email already exists in the main users table
    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ?', [user.email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      // Send a 409 Conflict status code
      return res.status(409).json({ error: 'Email already registered' });
    }


    // Add to users
    await connection.execute(
      'INSERT INTO users (id, email, password, fullName, role, status, leaveCredits, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', // Assuming pending_users also stores hashed password
      [user.id, user.email, user.password, user.fullName, user.role, 'active', 20, false] // The password from pending_users should already be hashed
    );

    // Remove from pending
    await connection.execute('DELETE FROM pending_users WHERE id = ?', [userId]);

    await connection.commit();
    broadcastDataChange();
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

    // Check if email already exists in either users or pending_users table
    const [existingUsers] = await db.execute('SELECT email FROM users WHERE email = ?', [email]);
    const [existingPendingUsers] = await db.execute('SELECT email FROM pending_users WHERE email = ?', [email]);

    if (existingUsers.length > 0 || existingPendingUsers.length > 0) {
      // Send a 409 Conflict status code
      return res.status(409).json({ error: 'Email already registered' });
    }

    // The frontend API call for addPendingUser needs to be updated to handle this error.
    // I will make that change in another step if you'd like.

    await db.execute(
      'INSERT INTO pending_users (id, email, password, fullName, role) VALUES (?, ?, ?, ?, ?)',
      [id, email, hashedPassword, fullName, role]
    );
    broadcastDataChange();
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
    broadcastDataChange();
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
    broadcastDataChange();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add log' });
  }
});

// Delete log
app.delete('/api/logs/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM logs WHERE id = ?', [req.params.id]);
    broadcastDataChange();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete log:', error);
    res.status(500).json({ error: 'Failed to delete log' });
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
    broadcastDataChange();
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
    broadcastDataChange();
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
    broadcastDataChange();
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
    broadcastDataChange();
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
    broadcastDataChange();
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
    broadcastDataChange();
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
    broadcastDataChange();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update leave credits' });
  }
});

// Password Reset Request
app.post('/api/password-reset-requests', async (req, res) => {
  try {
    const { email } = req.body;
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'No user found with this email address.' });
    }
    const user = users[0];

    // Check if there's already a pending request for this user
    const [existingRequests] = await db.execute('SELECT * FROM password_reset_requests WHERE userEmail = ? AND status = "pending"', [email]);
    if (existingRequests.length > 0) {
      return res.status(409).json({ error: 'A password reset request for this account is already pending.' });
    }

    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    await db.execute(
      'INSERT INTO password_reset_requests (id, userEmail, userName, timestamp) VALUES (?, ?, ?, ?)',
      [id, user.email, user.fullName, timestamp]
    );

    broadcastDataChange();
    res.json({ success: true, message: 'Password reset request submitted successfully.' });
  } catch (error) {
    console.error('Failed to submit password reset request:', error);
    res.status(500).json({ error: 'Failed to submit password reset request.' });
  }
});

// Update Password Reset Request Status (Approve/Deny)
app.put('/api/password-reset-requests/:id', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { status } = req.body;
    const { id } = req.params;

    const [requests] = await connection.execute('SELECT * FROM password_reset_requests WHERE id = ?', [id]);
    if (requests.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Request not found.' });
    }
    const request = requests[0];

    let tempPassword = null;
    if (status === 'approved') {
      // Generate a temporary password
      tempPassword = Math.random().toString(36).slice(-8);
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

      // Update user's password and set flag to force change on next login
      await connection.execute(
        'UPDATE users SET password = ?, must_change_password = TRUE WHERE email = ?',
        [hashedPassword, request.userEmail]
      );
    }

    // Update the request status and store the temp password if approved
    await connection.execute(
      'UPDATE password_reset_requests SET status = ?, tempPassword = ? WHERE id = ?',
      [status, tempPassword, id]
    );

    await connection.commit();
    broadcastDataChange();
    res.json({ success: true, tempPassword }); // Return temp password to admin
  } catch (error) {
    await connection.rollback();
    console.error('Failed to update password reset request:', error);
    res.status(500).json({ error: 'Failed to update password reset request.' });
  } finally {
    connection.release();
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

      // Ensure must_change_password is a boolean for the frontend
      user.must_change_password = Boolean(user.must_change_password);

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
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
    if (allowedOrigins.length > 0) {
      console.log('CORS is enabled for the following origins:');
      allowedOrigins.forEach(origin => console.log(`- ${origin}`));
    } else {
      console.warn('Warning: CORS_ALLOWED_ORIGINS is not set in .env file. API may be unreachable from the frontend.');
    }
  });
}

startServer();