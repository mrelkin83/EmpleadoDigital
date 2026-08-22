import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@empleado/shared': r('./packages/shared/src/index.ts'),
      '@empleado/ai-core': r('./packages/ai-core/src/index.ts'),
      '@empleado/ai-providers': r('./packages/ai-providers/src/index.ts'),
      '@empleado/social': r('./packages/social/src/index.ts'),
      '@empleado/brand': r('./packages/brand/src/index.ts'),
      '@empleado/content': r('./packages/content/src/index.ts'),
      '@empleado/skills': r('./packages/skills/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    environment: 'node',
  },
});
