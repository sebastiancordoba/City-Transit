import express from 'express';
import { createServer as createViteServer } from 'vite';
import { findRoute } from './src/route-algorithm.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/route', (req, res) => {
    const { originLat, originLng, destLat, destLng } = req.body;
    if (!originLat || !originLng || !destLat || !destLng) {
      return res.status(400).json({ error: 'Missing coordinates' });
    }

    const route = findRoute(originLat, originLng, destLat, destLng);
    if (!route) {
      return res.status(404).json({ error: 'No route found' });
    }

    res.json(route);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
