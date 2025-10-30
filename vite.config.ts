import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { VitePluginRadar } from 'vite-plugin-radar';
import Sitemap from 'vite-plugin-sitemap';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    VitePluginRadar({
      analytics: process.env.VITE_GA_ID ? { id: process.env.VITE_GA_ID } : undefined,
    }),
    react(),
    tailwindcss(),
    Sitemap({ hostname: 'https://floodstatus.vercel.app' }),
  ],
});
