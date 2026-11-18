// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://antontoshev.com',
  output: 'static',
  // Replit serves the dev preview from its own domain
  vite: { server: { allowedHosts: true } },
});
