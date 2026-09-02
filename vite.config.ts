import { defineConfig } from "vite";

/**
 * The tester build: static files behind one URL (UI spec 5.5, 7.1).
 *
 * `base` is relative so the same output works from a project page
 * (`/<repo>/`), from a user page (`/`) and from a `file://` copy a tester
 * has been sent as a zip. Nothing is fetched at runtime -- the data tables
 * are bundled -- so there is no absolute path to get wrong.
 */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
