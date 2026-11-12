import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:process.env.MARKET32_BASE||'/',build:{outDir:'dist',emptyOutDir:true,assetsDir:'assets'}});
