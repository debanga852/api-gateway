/**
 * Mock downstream services for local development.
 * Service A (port 3001) — Users API
 * Service B (port 3002) — Products + Orders API
 */
import express, { Request, Response } from 'express';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomLatency(min = 10, max = 80) {
  return Math.floor(Math.random() * (max - min) + min);
}

// Occasionally simulate a 500 to trigger circuit breaker (1 in 10 when enabled)
let failMode = false;

// ─── Seed Data ────────────────────────────────────────────────────────────────

const users = [
  { id: '1', name: 'Alice Johnson', email: 'alice@example.com', role: 'admin',   createdAt: '2024-01-01' },
  { id: '2', name: 'Bob Smith',     email: 'bob@example.com',   role: 'user',    createdAt: '2024-02-14' },
  { id: '3', name: 'Carol White',   email: 'carol@example.com', role: 'user',    createdAt: '2024-03-20' },
  { id: '4', name: 'Dan Brown',     email: 'dan@example.com',   role: 'service', createdAt: '2024-04-01' },
];

const products = [
  { id: 'p1', name: 'Widget Pro',    price: 29.99, stock: 150, category: 'hardware' },
  { id: 'p2', name: 'Gadget Ultra',  price: 99.99, stock: 42,  category: 'electronics' },
  { id: 'p3', name: 'Super Tool',    price: 14.50, stock: 300, category: 'tools' },
  { id: 'p4', name: 'Mega Component',price: 5.00,  stock: 999, category: 'hardware' },
];

const orders = [
  { id: 'o1', userId: '1', productId: 'p1', qty: 2, status: 'shipped',  total: 59.98 },
  { id: 'o2', userId: '2', productId: 'p2', qty: 1, status: 'pending',  total: 99.99 },
  { id: 'o3', userId: '1', productId: 'p3', qty: 5, status: 'delivered',total: 72.50 },
];

// ─── Service A — Users ────────────────────────────────────────────────────────

const serviceA = express();
serviceA.use(express.json());

serviceA.use(async (_req, _res, next) => {
  await delay(randomLatency());
  if (failMode && Math.random() < 0.1) {
    _res.status(500).json({ error: 'Simulated upstream failure' });
    return;
  }
  next();
});

serviceA.get('/api/users', (_req, res: Response) => {
  res.json({ data: users, total: users.length });
});

serviceA.get('/api/users/:id', (req, res: Response) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

serviceA.post('/api/users', (req, res: Response) => {
  const { name, email, role } = req.body as { name: string; email: string; role: string };
  const newUser = {
    id:        String(users.length + 1),
    name,
    email,
    role:      role ?? 'user',
    createdAt: new Date().toISOString().split('T')[0],
  };
  users.push(newUser);
  res.status(201).json(newUser);
});

serviceA.put('/api/users/:id', (req, res: Response) => {
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'User not found' }); return; }
  Object.assign(users[idx], req.body);
  res.json(users[idx]);
});

serviceA.delete('/api/users/:id', (req, res: Response) => {
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'User not found' }); return; }
  users.splice(idx, 1);
  res.status(204).send();
});

// Fail mode toggle (for testing circuit breaker)
serviceA.post('/admin/fail-mode', (req, res: Response) => {
  failMode = (req.body as { enabled: boolean }).enabled ?? !failMode;
  res.json({ failMode });
});

serviceA.listen(3001, () => console.log('🟢 Service A (Users) listening on :3001'));

// ─── Service B — Products + Orders ───────────────────────────────────────────

const serviceB = express();
serviceB.use(express.json());

serviceB.use(async (_req, _res, next) => {
  await delay(randomLatency(20, 120));
  if (failMode && Math.random() < 0.1) {
    _res.status(500).json({ error: 'Simulated upstream failure' });
    return;
  }
  next();
});

// Products
serviceB.get('/api/products', (_req, res: Response) => {
  res.json({ data: products, total: products.length });
});

serviceB.get('/api/products/:id', (req, res: Response) => {
  const p = products.find((p) => p.id === req.params.id);
  if (!p) { res.status(404).json({ error: 'Product not found' }); return; }
  res.json(p);
});

serviceB.post('/api/products', (req, res: Response) => {
  const { name, price, stock, category } = req.body as typeof products[0];
  const newProduct = { id: `p${products.length + 1}`, name, price, stock, category };
  products.push(newProduct);
  res.status(201).json(newProduct);
});

serviceB.put('/api/products/:id', (req, res: Response) => {
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Product not found' }); return; }
  Object.assign(products[idx], req.body);
  res.json(products[idx]);
});

serviceB.delete('/api/products/:id', (req, res: Response) => {
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Product not found' }); return; }
  products.splice(idx, 1);
  res.status(204).send();
});

// Orders
serviceB.get('/api/orders', (_req, res: Response) => {
  res.json({ data: orders, total: orders.length });
});

serviceB.get('/api/orders/:id', (req, res: Response) => {
  const o = orders.find((o) => o.id === req.params.id);
  if (!o) { res.status(404).json({ error: 'Order not found' }); return; }
  res.json(o);
});

serviceB.post('/api/orders', (req, res: Response) => {
  const { userId, productId, qty } = req.body as typeof orders[0];
  const product = products.find((p) => p.id === productId);
  const newOrder = {
    id:        `o${orders.length + 1}`,
    userId,
    productId,
    qty,
    status:    'pending',
    total:     (product?.price ?? 0) * qty,
  };
  orders.push(newOrder);
  res.status(201).json(newOrder);
});

serviceB.listen(3002, () => console.log('🟢 Service B (Products+Orders) listening on :3002'));

console.log('🔧 Mock services started. Toggle fail mode: POST /admin/fail-mode {"enabled":true}');
