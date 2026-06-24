import { defineConfig } from "tsup";

// Bundle the whole service (incl. @m2cloud/* workspace deps and npm deps)
// into a single ESM file so the runtime image needs no node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  noExternal: [/.*/],
  external: ["bufferutil", "utf-8-validate"],
  clean: true,
  sourcemap: true,
  minify: false,
});
