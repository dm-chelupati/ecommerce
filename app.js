const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Database connection — PostgreSQL installed on same VM
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sapcommerce',
  user: process.env.DB_USER || 'sapapp',
  password: process.env.DB_PASSWORD || 'sapapp123',
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
});

// Initialize database tables
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50),
        price DECIMAL(10,2),
        stock INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed data if empty
    const { rows } = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, category, price, stock) VALUES
        ('SAP S/4HANA License', 'Software', 15000.00, 50),
        ('HANA DB Instance', 'Infrastructure', 8500.00, 20),
        ('Fiori Frontend Server', 'Software', 3200.00, 100),
        ('Integration Suite', 'Middleware', 5600.00, 35),
        ('Analytics Cloud Seat', 'Analytics', 1200.00, 200),
        ('Business Network License', 'Network', 2800.00, 75),
        ('SuccessFactors HCM', 'HR', 4500.00, 60),
        ('Ariba Procurement', 'Procurement', 3800.00, 45);
      `);
    }
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database init error:', err.message);
  }
}

// ---- HTML Frontend ----
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>SAP Commerce Portal</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; margin: 0; background: #f4f4f4; }
    .header { background: #0070f2; color: white; padding: 20px 40px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header small { opacity: 0.8; }
    .content { max-width: 1000px; margin: 20px auto; padding: 0 20px; }
    .card { background: white; border-radius: 8px; padding: 20px; margin: 15px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { margin-top: 0; color: #333; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
    .status { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; }
    .status.ok { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    .btn { background: #0070f2; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
    .btn:hover { background: #0058c7; }
    #health-status { margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SAP Commerce Portal</h1>
    <small>Enterprise Resource Planning — Demo Environment</small>
  </div>
  <div class="content">
    <div class="card">
      <h2>System Health</h2>
      <button class="btn" onclick="checkHealth()">Check Health</button>
      <div id="health-status"></div>
    </div>
    <div class="card">
      <h2>Product Catalog</h2>
      <div id="products">Loading...</div>
    </div>
    <div class="card">
      <h2>Recent Orders</h2>
      <div id="orders">Loading...</div>
    </div>
  </div>
  <script>
    async function checkHealth() {
      const el = document.getElementById('health-status');
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        el.innerHTML = '<span class="status ' + (data.database === 'connected' ? 'ok' : 'error') + '">'
          + 'DB: ' + data.database + '</span> '
          + '<span class="status ok">App: ' + data.status + '</span>';
      } catch(e) {
        el.innerHTML = '<span class="status error">Error: ' + e.message + '</span>';
      }
    }
    async function loadProducts() {
      try {
        const res = await fetch('/api/products');
        const products = await res.json();
        document.getElementById('products').innerHTML = '<table><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr>'
          + products.map(p => '<tr><td>'+p.name+'</td><td>'+p.category+'</td><td>$'+p.price+'</td><td>'+p.stock+'</td><td><button class="btn" onclick="placeOrder('+p.id+')">Order</button></td></tr>').join('')
          + '</table>';
      } catch(e) {
        document.getElementById('products').innerHTML = '<span class="status error">Error loading products: ' + e.message + '</span>';
      }
    }
    async function loadOrders() {
      try {
        const res = await fetch('/api/orders');
        const orders = await res.json();
        if (orders.length === 0) {
          document.getElementById('orders').innerHTML = '<p>No orders yet. Click "Order" on a product above.</p>';
          return;
        }
        document.getElementById('orders').innerHTML = '<table><tr><th>Order #</th><th>Product</th><th>Qty</th><th>Status</th><th>Date</th></tr>'
          + orders.map(o => '<tr><td>'+o.id+'</td><td>'+o.product_name+'</td><td>'+o.quantity+'</td><td><span class="status ok">'+o.status+'</span></td><td>'+new Date(o.created_at).toLocaleString()+'</td></tr>').join('')
          + '</table>';
      } catch(e) {
        document.getElementById('orders').innerHTML = '<span class="status error">Error: ' + e.message + '</span>';
      }
    }
    async function placeOrder(productId) {
      try {
        await fetch('/api/orders', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({product_id: productId, quantity: 1}) });
        loadOrders();
        loadProducts();
      } catch(e) { alert('Order failed: ' + e.message); }
    }
    loadProducts();
    loadOrders();
    checkHealth();
  </script>
</body>
</html>`);
});

// ---- API Routes ----

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: err.message, timestamp: new Date().toISOString() });
  }
});

// Products
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// Orders
app.get('/api/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, p.name as product_name 
      FROM orders o JOIN products p ON o.product_id = p.id 
      ORDER BY o.created_at DESC LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { product_id, quantity } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO orders (product_id, quantity, status) VALUES ($1, $2, $3) RETURNING *',
      [product_id, quantity || 1, 'confirmed']
    );
    // Reduce stock
    await pool.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity || 1, product_id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Order failed', detail: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SAP Commerce API running on port ${PORT}`);
    console.log(`DB Host: ${process.env.DB_HOST}`);
  });
});
