import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [{
      name: "admin-runtime-config",
      transformIndexHtml(html) {
        if (!env.VITE_CLOUDBASE_ACCESS_KEY) {
          return html;
        }

        return html.replace(
          '<script type="module" src="/admin-runtime-config.js"></script>',
          `<script>window.__ADMIN_ACCESS_KEY__=${JSON.stringify(env.VITE_CLOUDBASE_ACCESS_KEY)};</script>`
        );
      },
      configureServer(server) {
        server.middlewares.use("/admin-runtime-config.js", (_request, response) => {
          response.setHeader("Content-Type", "application/javascript; charset=utf-8");
          response.end(`window.__ADMIN_ACCESS_KEY__=${JSON.stringify(env.VITE_CLOUDBASE_ACCESS_KEY || "")};`);
        });
      },
    }, react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          return undefined;
        },
      },
    },
  },
  };
});
