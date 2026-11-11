// After `vite build`, write dist/sw.js listing every built file, with a
// version stamp. Paths are relative, so it works under a GitHub Pages subpath.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

export function serviceWorkerPlugin() {
  let outDir = 'dist';
  return {
    name: 'dale-service-worker',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.startsWith('icons/source'));
      const hash = createHash('sha256');
      files.forEach((f) => hash.update(f).update(readFileSync(join(outDir, f))));
      const version = hash.digest('hex').slice(0, 12);
      const assets = ['./', ...files.map((f) => `./${f}`)];
      const sw = readFileSync(join(here, 'sw-template.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`service worker: ${assets.length} files, version ${version}`);
    },
  };
}
