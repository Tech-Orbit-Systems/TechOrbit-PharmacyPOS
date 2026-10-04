const path = require('node:path');

const SCHEME = 'techorbit';
const ENTRY_URL = `${SCHEME}://app/index.html`;

function resolveAppAsset(requestUrl, distDirectory) {
  let url;
  try { url = new URL(requestUrl); } catch { return null; }
  if (url.protocol !== `${SCHEME}:` || url.host !== 'app' || url.username || url.password || url.port || url.search || url.hash) return null;
  const pathname = url.pathname;
  if (pathname === '/' || pathname === '/index.html') return path.join(distDirectory, 'index.html');
  // Vite emits hashed, flat assets. Never translate an arbitrary URL into a disk path.
  if (!/^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|webp|woff2?)$/.test(pathname)) return null;
  return path.join(distDirectory, pathname.slice(1));
}

module.exports = { SCHEME, ENTRY_URL, resolveAppAsset };
