const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json());

// Azure SQL connection config
const dbConfig = {
  server: process.env.DB_HOST,
  database: process.env.DB_NAME || 'ecommerce',
  user: process.env.DB_USER || 'sqladmin',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 10000,
    requestTimeout: 10000,
  },
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

// Initialize database tables
async function initDb() {
  try {
    const p = await getPool();
    await p.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'products')
      CREATE TABLE products (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        category NVARCHAR(50),
        price DECIMAL(10,2),
        stock INT DEFAULT 0
      );

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'orders')
      CREATE TABLE orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        product_id INT FOREIGN KEY REFERENCES products(id),
        quantity INT,
        status NVARCHAR(20) DEFAULT 'pending',
        created_at DATETIME DEFAULT GETDATE()
      );
    `);

    // Seed data if empty
    const result = await p.request().query('SELECT COUNT(*) as cnt FROM products');
    if (result.recordset[0].cnt === 0) {
      await p.request().query(`
        INSERT INTO products (name, category, price, stock) VALUES
        ('ERP Core License', 'Software', 15000.00, 50),
        ('HANA DB Instance', 'Infrastructure', 8500.00, 20),
        ('Frontend Server', 'Software', 3200.00, 100),
        ('Integration Suite', 'Middleware', 5600.00, 35),
        ('Analytics Cloud Seat', 'Analytics', 1200.00, 200),
        ('Business Network License', 'Network', 2800.00, 75),
        ('HCM Module', 'HR', 4500.00, 60),
        ('Procurement Module', 'Procurement', 3800.00, 45);
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
  <title>E-Commerce Portal</title>
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
  </style>
</head>
<body>
  <div class="header">
    <h1>E-Commerce Portal</h1>
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
          document.getElementById('orders').innerHTML = '<p>No orders yet.</p>';
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
    loadProducts(); loadOrders(); checkHealth();
  </script>
</body>
</html>`);
});

// ---- API Routes ----
app.get('/api/health', async (req, res) => {
  try {
    const p = await getPool();
    await p.request().query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected', server: process.env.DB_HOST, timestamp: new Date().toISOString() });
  } catch (err) {
    pool = null; // Reset pool on failure
    res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const p = await getPool();
    const result = await p.request().query('SELECT * FROM products ORDER BY id');
    res.json(result.recordset);
  } catch (err) {
    pool = null;
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const p = await getPool();
    const result = await p.request().query(`
      SELECT o.*, p.name as product_name
      FROM orders o JOIN products p ON o.product_id = p.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    pool = null;
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { product_id, quantity } = req.body;
    const p = await getPool();
    const result = await p.request()
      .input('pid', sql.Int, product_id)
      .input('qty', sql.Int, quantity || 1)
      .query('INSERT INTO orders (product_id, quantity, status) OUTPUT INSERTED.* VALUES (@pid, @qty, \'confirmed\')');
    await p.request().input('qty', sql.Int, quantity || 1).input('pid', sql.Int, product_id)
      .query('UPDATE products SET stock = stock - @qty WHERE id = @pid');
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    pool = null;
    res.status(500).json({ error: 'Order failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`E-Commerce API running on port ${PORT}`);
    console.log(`DB Host: ${process.env.DB_HOST}`);
  });
}).catch(err => {
  console.error('Failed to init DB, starting anyway:', err.message);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`E-Commerce API running on port ${PORT} (DB not connected)`);
  });
});
