import { defineConfig } from "tsup";

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
