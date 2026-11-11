// Tiny hash router: "#/path". Hash URLs work on GitHub Pages under any
// sub-folder without server configuration.
import { signal } from '@preact/signals';

const parse = () => (typeof location === 'undefined' ? '/' : location.hash.replace(/^#/, '') || '/');
export const route = signal(parse());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    route.value = parse();
    window.scrollTo(0, 0);
  });
}

export function navigate(path) {
  if (location.hash === `#${path}`) route.value = path;
  else location.hash = path;
}
