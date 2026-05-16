import { defineConfig } from 'vite'

function icsProxyPlugin() {
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/api/ics') return false;

      const target = url.searchParams.get('url');
      if (!target) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing url query parameter' }));
        return true;
      }
      let parsed;
      try { parsed = new URL(target); } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid target URL' }));
        return true;
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Only http/https targets are allowed' }));
        return true;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: { Accept: 'text/calendar, text/plain, */*' },
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: `Upstream returned ${upstream.status}` }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(text);
      return true;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: String(err?.message || err) }));
      return true;
    }
  };

  return {
    name: 'ics-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Semester2Plattform/' : '/',
  plugins: [icsProxyPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  envDir: '.',
})
