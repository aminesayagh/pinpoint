import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Pinpoint',
    description: 'Review a website visually and send the feedback to Linear as a batch of issues.',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'scripting', 'tabs', 'contextMenus'],
    // Linear API, and the storage host Linear signs screenshot uploads for.
    host_permissions: ['https://api.linear.app/*', 'https://storage.googleapis.com/*'],
    // Asked once, on the first Allow: screenshots need it. Pinpoint keeps its own list of
    // allowed sites and only works there (lib/sites.ts).
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'Open Pinpoint' },
    // The floating comment box is an extension frame on the reviewed page (composer.ts).
    // use_dynamic_url: sites cannot probe a fixed URL to detect Pinpoint.
    web_accessible_resources: [
      { resources: ['composer.html'], matches: ['<all_urls>'], use_dynamic_url: true },
    ],
    commands: {
      'select-element': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Select an element to comment on',
      },
    },
  },
});
