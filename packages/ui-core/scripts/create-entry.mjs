import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const customElementsDir = resolve('dist/custom-elements');
const components = readdirSync(customElementsDir)
  .filter((file) => /^gt-[a-z0-9-]+\.js$/.test(file))
  .map((file) => file.slice(0, -3))
  .sort();

const identifier = (tag) => tag.replace(/(^|-)\w/g, (part) => part.at(-1).toUpperCase());
const imports = components
  .map((tag) => `import { defineCustomElement as define${identifier(tag)} } from './custom-elements/${tag}.js';`)
  .join('\n');
const definitions = components
  .map((tag) => `  define${identifier(tag)}();`)
  .join('\n');

writeFileSync(resolve('dist/loader.js'), `${imports}

export function defineCustomElements() {
  if (typeof customElements === 'undefined') return;
${definitions}
}

export const registerGuYanElements = defineCustomElements;
`);

writeFileSync(resolve('dist/loader.d.ts'), `export declare function defineCustomElements(): void;
export declare const registerGuYanElements: typeof defineCustomElements;
`);

writeFileSync(resolve('dist/index.js'), `export { defineCustomElements, registerGuYanElements } from './loader.js';
`);

writeFileSync(resolve('dist/index.d.ts'), `export * from './custom-elements/index.js';
export { defineCustomElements, registerGuYanElements } from './loader.js';
`);
