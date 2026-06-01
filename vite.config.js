import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig(({ mode }) => {
  // loadEnv with prefix '' reads ALL vars (including BACKEND_URL without VITE_ prefix).
  // BACKEND_URL is never bundled into client code — only used here for the proxy target.
  const env = loadEnv(mode, process.cwd(), '')

  const backendUrl =
    env.BACKEND_URL       ||   // preferred: explicit non-VITE_ var (set in .env)
    env.VITE_SERVER_URL   ||   // fallback: old variable name
    'http://localhost:5000'    // last resort: local backend

  console.log(`[vite] proxy target → ${backendUrl}`)

  /** Shared proxy options for all routes */
  const proxyOpts = {
    target:       backendUrl,
    changeOrigin: true,   // rewrites the Host header — required for Azure App Service
    secure:       false,  // don't verify SSL cert (safe for dev proxy, Azure cert is valid)
    configure: (proxy) => {
      proxy.on('error', (err, _req, _res) => {
        console.warn('[vite proxy] error:', err.message)
      })
      proxy.on('proxyRes', (proxyRes, req) => {
        if (proxyRes.statusCode >= 500) {
          console.warn(`[vite proxy] backend returned ${proxyRes.statusCode} for ${req.url}`)
        }
      })
    },
  }

  return {
    plugins: [tailwindcss(), react()],

    server: {
      proxy: {
        // All /api/* REST calls forwarded to the Flask backend.
        // The browser only ever talks to localhost → no CORS preflight at all.
        '/api': proxyOpts,

        // Socket.IO — handles both HTTP long-polling (/socket.io/?) and
        // the WebSocket upgrade.  ws:true tells Vite to proxy WS as well.
        '/socket.io': { ...proxyOpts, ws: true },
      },
    },
  }
})
