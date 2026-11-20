// Local readers use the application's offline image cache. Pages uses the same
// two image hosts as the existing static reader, without patching DOM prototypes.
const web = !!document.querySelector('meta[name="catalog-web"]');
const primary = 'https://5e.kiwee.top/img/';
const mirror = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/';

export function mediaUrl(path) {
  if (!path) return null;
  const url = new URL(path,document.baseURI);
  if (!['http:','https:'].includes(url.protocol)) return null;
  if (web && url.origin === location.origin) {
    const root = new URL('../',document.baseURI).pathname;
    const rel = url.pathname.startsWith(root) ? url.pathname.slice(root.length) : url.pathname.slice(1);
    if (rel.startsWith('img/')) return primary + rel.slice(4) + url.search;
    if (rel.startsWith('__remote/')) return 'https://' + rel.slice(9) + url.search;
  }
  return url.href;
}

export function tryImageMirror(img) {
  if (!web || !img.src.startsWith(primary)) return false;
  img.src = mirror + img.src.slice(primary.length);
  return true;
}
