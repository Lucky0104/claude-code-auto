import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Meta Business Suite Auto-Reply',
  description:
    'Auto-comment on Facebook and Instagram posts managed via Meta Business Suite. By Lucky.',
  version: '1.0.0',
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://business.facebook.com/*'],
  background: {
    service_worker: 'src/background/service_worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://business.facebook.com/*'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'MBS Auto-Reply',
  },
  icons: {
    '16': 'public/icons/icon16.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
});
