import { defineConfig } from 'vitepress';

export default defineConfig({
	title: 'mtx-decompressor',
	description: 'Extract TrueType fonts from MicroType Express (MTX) compressed EOT files in the browser and Node.js.',
	base: '/mtx-decompressor/',
	cleanUrls: true,
	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/getting-started' },
			{ text: 'API', link: '/api' },
			{ text: 'Demo', link: '/#live-demo' },
			{
				text: 'Releases',
				link: 'https://github.com/ChristopherVR/mtx-decompressor/releases',
			},
		],
		sidebar: [
			{
				text: 'Guide',
				items: [
					{ text: 'Getting started', link: '/getting-started' },
					{ text: 'Usage', link: '/usage' },
					{ text: 'How it works', link: '/how-it-works' },
				],
			},
			{
				text: 'Reference',
				items: [{ text: 'API', link: '/api' }],
			},
		],
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/ChristopherVR/mtx-decompressor' },
			{ icon: 'npm', link: 'https://www.npmjs.com/package/mtx-decompressor' },
		],
		search: { provider: 'local' },
		footer: {
			message: 'Released under the MPL-2.0 License.',
		},
	},
});
