import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        director: resolve(__dirname, "director.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7766",
        changeOrigin: true,
      },
    },
  },
});
