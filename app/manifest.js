// Lets phones install the site to the home screen, and (on Android) offer it in the Share menu.
export default function manifest() {
  return {
    name: 'Daily League',
    short_name: 'Daily League',
    description: 'Compete with friends across your daily games.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f5f7',
    theme_color: '#2f6bff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: { action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
  };
}
