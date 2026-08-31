import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose -- that file's devApi() plugin
// imports src/server/*.ts (which read process.env.SUPABASE_SERVICE_ROLE_KEY
// etc. inside function bodies) purely for the dev middleware; keeping test
// running decoupled from that avoids any accidental coupling between "run
// the test suite" and "have Supabase env vars configured."
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
