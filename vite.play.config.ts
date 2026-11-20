import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Standalone browser mode: `npm run play`.
// Serves the real game (src/client/game.html) with hot reload, outside Reddit,
// using the localStorage backend and the Local demo bar. No Devvit server.
export default defineConfig({
  root: 'src/client',
  plugins: [react(), tailwind()],
  define: {
    'import.meta.env.VITE_LOCAL_DEMO': JSON.stringify('1'),
  },
  server: {
    port: 5173,
    open: '/game.html',
  },
});
