import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { resolveAndProcessDinkWebhook } from './src/server/dinkWebhook.js'
import { parseDinkPayload, readRawBody } from './src/server/dinkPayload.js'
import { selectRows } from './src/server/supabaseAdmin.js'
import { syncAllParticipants, syncOneParticipant } from './src/server/participantSync.js'
import { checkChallengeProgress } from './src/server/challengeProgress.js'

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
          const contentType = req.headers['content-type'] ?? ''
          const parsed = await parseDinkPayload(contentType, await readRawBody(req))
          // Resolves the account secret (BACKLOG.md #13's profile_secrets)
          // and fans the event out to every challenge it currently matches.
          const { status, body } = await resolveAndProcessDinkWebhook(secret, parsed.data, parsed.image)
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Webhook processing failed' }))
        }
      })

      // Mirrors api/sync-snapshots.ts for local testing of the daily cron.
      server.middlewares.use('/api/sync-snapshots', async (req, res) => {
        const secret = process.env.CRON_SECRET
        if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
          res.statusCode = 401
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }
        try {
          const result = await syncAllParticipants()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Sync failed' }))
        }
      })

      // Mirrors api/sync-participant.ts -- join-time baseline sync.
      server.middlewares.use('/api/sync-participant', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        try {
          const raw = await readRawBody(req)
          const parsed = raw.length > 0 ? JSON.parse(raw.toString('utf8')) : {}
          const participantId = parsed?.participantId
          if (typeof participantId !== 'string') {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing participantId' }))
            return
          }
          const [participant] = await selectRows<{ id: string; challenge_id: string; rsn: string }>(
            'challenge_participants',
            `id=eq.${encodeURIComponent(participantId)}&select=id,challenge_id,rsn`,
          )
          if (!participant) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Unknown participant' }))
            return
          }
          res.setHeader('Content-Type', 'application/json')
          try {
            await syncOneParticipant(participant.challenge_id, participant.id, participant.rsn)
            await checkChallengeProgress(participant.id, false).catch(() => {})
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 200
            res.end(JSON.stringify({ ok: false, note: 'hiscores fetch failed' }))
          }
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Sync failed' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
