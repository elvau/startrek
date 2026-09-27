import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["rules-test/**/*.test.ts"], testTimeout: 20000, fileParallelism: false } });
