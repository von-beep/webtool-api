const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize data file
async function initDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    // File doesn't exist, create with initial data
    const initialData = {
      users: [],
      pendingUsers: [],
      logs: [],
      holidayRequests: [],
      leaveApplications: []
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Helper function to read data
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return { users: [], pendingUsers: [], logs: [], holidayRequests: [], leaveApplications: [] };
  }
}

// Helper function to write data
async function writeData(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing data file:', error);
  }
}

// API Routes

// Get all data
app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Add user
app.post('/api/users', async (req, res) => {
  try {
    const data = await readData();
    const { id, email, password, fullName, role } = req.body;
    const newUser = { id, email, password, fullName, role, status: 'active' };
    if (!data.users) {
      data.users = [];
    }
    data.users.push(newUser);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Update user status
app.put('/api/users/:id/status', async (req, res) => {
  try {
    const data = await readData();
    const { status } = req.body;
    const userIndex = data.users.findIndex(u => u.id === req.params.id);
    if (userIndex !== -1) {
      data.users[userIndex].status = status;
      await writeData(data);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Reset user password
app.put('/api/users/:id/password', async (req, res) => {
  try {
    const data = await readData();
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password cannot be empty' });
    }
    const userIndex = data.users.findIndex(u => u.id === req.params.id);
    if (userIndex !== -1) {
      data.users[userIndex].password = password;
      await writeData(data);
    }
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Add pending user
app.post('/api/pending-users', async (req, res) => {
  try {
    const data = await readData();
    const { id, email, password, fullName, role } = req.body;
    const newUser = { id, email, password, fullName, role };
    if (!data.pendingUsers) {
      data.pendingUsers = [];
    }
    data.pendingUsers.push(newUser);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add pending user' });
  }
});

// Approve user
app.post('/api/approve-user', async (req, res) => {
  try {
    const data = await readData();
    const { userId } = req.body;
    const userIndex = data.pendingUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = data.pendingUsers[userIndex];
    if (!data.users) {
      data.users = [];
    }
    if (!data.pendingUsers) {
      data.pendingUsers = [];
    }
    data.users.push({ ...user, status: 'active' });
    data.pendingUsers.splice(userIndex, 1);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Deny user
app.delete('/api/pending-users/:id', async (req, res) => {
  try {
    const data = await readData();
    data.pendingUsers = data.pendingUsers.filter(u => u.id !== req.params.id);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to deny user' });
  }
});

// Add log
app.post('/api/logs', async (req, res) => {
  try {
    const data = await readData();
    const { userEmail, userName, type, timestamp, image, location } = req.body;
    const newLog = { userEmail, userName, type, timestamp, image, location };
    if (!data.logs) {
      data.logs = [];
    }
    data.logs.push(newLog);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add log' });
  }
});

// Add holiday request
app.post('/api/holiday-requests', async (req, res) => {
  try {
    const data = await readData();
    const { id, userEmail, userName, holidayName, holidayDate, details, status, timestamp } = req.body;
    const newRequest = { id, userEmail, userName, holidayName, holidayDate, details, status, timestamp };
    if (!data.holidayRequests) {
      data.holidayRequests = [];
    }
    data.holidayRequests.push(newRequest);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add holiday request' });
  }
});

// Update holiday request status
app.put('/api/holiday-requests/:id', async (req, res) => {
  try {
    const data = await readData();
    const { status } = req.body;
    const requestIndex = data.holidayRequests.findIndex(r => r.id === req.params.id);
    if (requestIndex !== -1) {
      data.holidayRequests[requestIndex].status = status;
      await writeData(data);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update holiday request' });
  }
});

// Add leave application
app.post('/api/leave-applications', async (req, res) => {
  try {
    const data = await readData();
    const { id, userEmail, userName, leaveType, startDate, endDate, details, status, timestamp } = req.body;
    const newApplication = { id, userEmail, userName, leaveType, startDate, endDate, details, status, timestamp };
    if (!data.leaveApplications) {
      data.leaveApplications = [];
    }
    data.leaveApplications.push(newApplication);
    await writeData(data);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add leave application' });
  }
});

// Update leave application status
app.put('/api/leave-applications/:id', async (req, res) => {
  try {
    const data = await readData();
    const { status } = req.body;
    const requestIndex = data.leaveApplications.findIndex(r => r.id === req.params.id);
    if (requestIndex !== -1) {
      data.leaveApplications[requestIndex].status = status;
      await writeData(data);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update leave application' });
  }
});

// Authenticate user
app.post('/api/auth/login', async (req, res) => {
  try {
    const data = await readData();
    const { email, password } = req.body;
    const user = data.users.find(u => u.email === email && u.password === password);

    if (user) {
      if (user.status === 'disabled') {
        return res.status(403).json({ error: 'Your account has been disabled.' });
      }
      res.json({ success: true, user: user });
    } else {
      const pendingUser = data.pendingUsers.find(u => u.email === email);
      if (pendingUser) {
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

// Reset data
app.post('/api/reset-data', async (req, res) => {
  try {
    const initialData = {
      users: [],
      pendingUsers: [],
      logs: [],
      holidayRequests: [],
      leaveApplications: []
    };
    await writeData(initialData);
    res.json({ success: true, message: 'All data has been cleared.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});
// Start server
app.listen(PORT, async () => {
  await initDataFile();
  console.log(`Mock backend server running on port ${PORT}`);
  console.log(`Data stored in: ${DATA_FILE}`);
});