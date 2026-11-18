import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages workflow, because GitHub Pages serves the
// site from /<repo-name>/ rather than from the domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
