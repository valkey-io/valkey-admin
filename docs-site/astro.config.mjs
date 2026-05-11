// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://valkey-admin.valkey.io',
	integrations: [
		starlight({
			title: 'Valkey Admin',
			head: [
				{
					tag: 'script',
					content: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MFFCB7SR');`,
				},
			],
			description: 'A desktop administration tool for Valkey instances',
			logo: {
				src: './src/assets/logo.png',
			},
			favicon: '/favicon.png',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/valkey-io/valkey-admin' }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'introduction' },
					],
				},
				{
					label: 'Features',
					items: [
						{ label: 'Dashboard', slug: 'features/dashboard' },
						{ label: 'Key Browser', slug: 'features/key-browser' },
						{ label: 'Send Command', slug: 'features/send-command' },
						{ label: 'Cluster Topology', slug: 'features/cluster-topology' },
						{ label: 'Activity', slug: 'features/activity' },
					],
				},
				{
					label: 'Deployment',
					items: [
						{ label: 'Desktop', slug: 'deployment/desktop' },
						{ label: 'Docker', slug: 'deployment/docker' },
						{ label: 'Kubernetes', slug: 'deployment/kubernetes' },
						{ label: 'AWS ElastiCache', slug: 'deployment/aws-elasticache' },
					],
				},
				{
					label: 'Settings',
					items: [
						{ label: 'Settings', slug: 'settings/settings' },
					],
				},
				{
					label: 'Configuration',
					items: [
						{ label: 'Overview', slug: 'configuration' },
						{ label: 'Server', slug: 'configuration/server' },
						{ label: 'Metrics', slug: 'configuration/metrics' },
						{ label: 'Frontend', slug: 'configuration/frontend' },
						{ label: 'Shared Constants', slug: 'configuration/shared' },
					],
				},
				{
					label: 'Development',
					items: [
						{ label: 'Contributing', slug: 'development/contributing' },
						{ label: 'Platform Support', slug: 'development/platform-support' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'License', slug: 'reference/license' },
						{ label: 'Troubleshooting', slug: 'reference/troubleshooting' },
						{ label: 'Security', slug: 'reference/security' },
					],
				},
			],
		}),
	],
});
