import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["rules-test/**/*.test.{ts,mjs}"], testTimeout: 20000, fileParallelism: false } });
