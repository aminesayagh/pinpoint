import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Pinpoint',
    description: 'Review a website visually and send the feedback to Linear as a batch of issues.',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'scripting', 'tabs'],
    // Linear API, and the storage host Linear signs screenshot uploads for.
    host_permissions: ['https://api.linear.app/*', 'https://storage.googleapis.com/*'],
    // Review sites are asked for one at a time (lib/sites.ts).
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: 'Open Pinpoint' },
  },
});
