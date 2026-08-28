import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const loaderPath = resolve('dist/loader.js');
const loaderSource = readFileSync(loaderPath, 'utf8');
const componentImports = [...loaderSource.matchAll(/from '(.\/custom-elements\/gt-[a-z0-9-]+\.js)'/g)];
const missingImports = componentImports
  .map(([, specifier]) => resolve(dirname(loaderPath), specifier))
  .filter((path) => !existsSync(path));

if (missingImports.length) {
  throw new Error(`Generated loader imports missing Custom Element modules:\n${missingImports.join('\n')}`);
}
