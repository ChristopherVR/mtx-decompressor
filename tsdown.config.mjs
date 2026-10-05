import { defineConfig } from 'tsdown';

export default defineConfig((options) => ({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	dts: { sourcemap: false },
	sourcemap: false,
	clean: !options.watch,
	treeshake: true,
	// Keep the published file names: index.mjs (ESM), index.js (CJS), index.d.ts.
	outExtensions: ({ format }) => ({ js: format === 'es' ? '.mjs' : '.js' }),
}));
