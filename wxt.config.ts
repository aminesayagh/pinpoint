import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Pinpoint',
    description: 'Review a website visually and send the feedback to Linear as a batch of issues.',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage'],
    action: { default_title: 'Open Pinpoint' },
  },
});
