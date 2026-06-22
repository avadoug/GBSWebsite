const { resolve } = require('node:path');
const { defineConfig } = require('vite');

module.exports = defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        paintingRoom: resolve(__dirname, 'painting-room/index.html')
      }
    }
  }
});
