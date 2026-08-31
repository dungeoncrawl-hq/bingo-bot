import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { processDinkWebhook } from './src/server/dinkWebhook'
import { parseDinkPayload, readRawBody } from './src/server/dinkPayload'
import { selectRows } from './src/server/supabaseAdmin'
import type { Challenge } from './src/db/types'

// vite.config.ts runs in a plain Node context -- unlike client code, it
// doesn't get .env.local values injected automatically, so the webhook's
// process.env reads (SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL) need this.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env.local') })

// Mirrors api/dink/[secret].ts so `npm run dev` behaves like the deployed
// Vercel serverless function, without needing the `vercel` CLI locally.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      // Mounted at /api/dink -- connect strips that prefix from req.url, so
      // inside the handler req.url is just "/<secret>".
      server.middlewares.use('/api/dink', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const url = new URL(req.url ?? '', 'http://localhost')
        const secret = url.pathname.replace(/^\/+|\/+$/g, '')
        try {
          const [challenge] = await selectRows<Challenge>('challenges', `dink_secret=eq.${encodeURIComponent(secret)}&select=*`)
          if (!challenge) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Unknown webhook' }))
            return
          }
          if (challenge.status === 'ended') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, note: 'challenge has ended' }))
            return
          }
          const contentType = req.headers['content-type'] ?? ''
          const parsed = await parseDinkPayload(contentType, await readRawBody(req))
          const { status, body } = await processDinkWebhook(challenge, parsed.data)
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Webhook processing failed' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
