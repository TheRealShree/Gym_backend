const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const url = require('url');

// Environment configuration
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym_data';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB Database');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    maxlength: 100
  },
  password: {
    type: String,
    required: true,
    maxlength: 255
  },
  email: {
    type: String,
    maxlength: 100,
    default: null
  }
}, {
  timestamps: true // This adds createdAt and updatedAt fields automatically
});

// Create User model
const User = mongoose.model('User', userSchema);

// Parse JSON body
const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });

// Send response
const sendResponse = (res, statusCode, data, contentType = 'application/json') => {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });

  if (contentType === 'application/json') {
    res.end(JSON.stringify(data));
  } else {
    res.end(data);
  }
};

// API routes
const routes = {
  'OPTIONS *': (req, res) => sendResponse(res, 200, '', 'text/plain'),

  'POST /register': async (req, res) => {
    try {
      const { name, password, email } = await parseBody(req);

      if (!name || !password) {
        return sendResponse(res, 400, { success: false, error: 'Name and password required' });
      }

      if (password.length < 6) {
        return sendResponse(res, 400, { success: false, error: 'Password must be at least 6 characters' });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ name });
      if (existingUser) {
        return sendResponse(res, 409, { success: false, error: 'Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create new user
      const newUser = new User({
        name,
        password: hashedPassword,
        email: email || null
      });

      const savedUser = await newUser.save();

      sendResponse(res, 201, { 
        success: true, 
        message: 'Account created', 
        userId: savedUser._id 
      });
    } catch (err) {
      console.error('Register error:', err);
      if (err.code === 11000) {
        // Duplicate key error
        sendResponse(res, 409, { success: false, error: 'Username already exists' });
      } else {
        sendResponse(res, 500, { success: false, error: 'Internal server error' });
      }
    }
  },

  'POST /login': async (req, res) => {
    try {
      const { name, password } = await parseBody(req);

      if (!name || !password) {
        return sendResponse(res, 400, { success: false, error: 'Name and password required' });
      }

      // Find user by name
      const user = await User.findOne({ name });
      if (!user) {
        return sendResponse(res, 401, { success: false, error: 'Invalid credentials' });
      }

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return sendResponse(res, 401, { success: false, error: 'Invalid credentials' });
      }

      sendResponse(res, 200, { 
        success: true, 
        message: 'Login successful', 
        userId: user._id 
      });
    } catch (err) {
      console.error('Login error:', err);
      sendResponse(res, 500, { success: false, error: 'Internal server error' });
    }
  },

  'GET /users': async (req, res) => {
    try {
      // Select only specific fields, exclude password
      const users = await User.find({}, { 
        name: 1, 
        email: 1, 
        createdAt: 1, 
        _id: 1 
      });
      
      sendResponse(res, 200, { success: true, users });
    } catch (err) {
      console.error('Fetch users error:', err);
      sendResponse(res, 500, { success: false, error: 'Internal server error' });
    }
  },

  'DELETE /user': async (req, res) => {
    try {
      const { id } = await parseBody(req);
      if (!id) return sendResponse(res, 400, { success: false, error: 'User ID required' });

      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return sendResponse(res, 400, { success: false, error: 'Invalid user ID format' });
      }

      const deletedUser = await User.findByIdAndDelete(id);

      if (!deletedUser) {
        return sendResponse(res, 404, { success: false, error: 'User not found' });
      }

      sendResponse(res, 200, { success: true, message: 'User deleted' });
    } catch (err) {
      console.error('Delete error:', err);
      sendResponse(res, 500, { success: false, error: 'Internal server error' });
    }
  },

  'PUT /user': async (req, res) => {
    try {
      const { id, email } = await parseBody(req);
      if (!id || !email) return sendResponse(res, 400, { success: false, error: 'ID and new email required' });

      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return sendResponse(res, 400, { success: false, error: 'Invalid user ID format' });
      }

      const updatedUser = await User.findByIdAndUpdate(
        id, 
        { email }, 
        { new: true, runValidators: true }
      );

      if (!updatedUser) {
        return sendResponse(res, 404, { success: false, error: 'User not found' });
      }

      sendResponse(res, 200, { success: true, message: 'Email updated' });
    } catch (err) {
      console.error('Update error:', err);
      sendResponse(res, 500, { success: false, error: 'Internal server error' });
    }
  },

  'GET /': (req, res) => {
    const html = `
      <html>
        <head><title>Body Garage</title></head>
        <body>
          <h1>🏋 Welcome to Body Garage Server</h1>
          <p>Environment: ${NODE_ENV}</p>
          <p>Server running on port: ${PORT}</p>
          <p>Use Postman or frontend to access API routes.</p>
        </body>
      </html>
    `;
    sendResponse(res, 200, html, 'text/html');
  },

  'GET /health': (req, res) => {
    sendResponse(res, 200, { 
      success: true, 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      port: PORT
    });
  }
};

// Server setup
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    routes['OPTIONS *'](req, res);
    return;
  }

  const routeKey = `${req.method} ${url.parse(req.url).pathname}`;
  if (routes[routeKey]) {
    await routes[routeKey](req, res);
  } else {
    sendResponse(res, 404, { error: 'Not found' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Start server
(async () => {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${NODE_ENV}`);
    console.log(`🗄️  Database: ${MONGODB_URI.includes('localhost') ? 'Local MongoDB' : 'Remote MongoDB'}`);
  });
})();