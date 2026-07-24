import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const components = process.argv.slice(2);

if (components.length === 0) {
  throw new Error('Pass at least one migrated gt-* component name.');
}

const forbidden = /<style|innerHTML|`[^`]*(?:\\:host|background\\s*:|box-shadow\\s*:)[^`]*`/;

for (const component of components) {
  const directory = resolve('src/components', component);
  const sourcePath = resolve(directory, `${component}.tsx`);
  const stylePath = resolve(directory, `${component}.css`);
  const contractPath = resolve(directory, `${component}.contract.ts`);

  if (!existsSync(sourcePath) || !existsSync(stylePath) || !existsSync(contractPath)) {
    throw new Error(`Missing style contract for ${component}`);
  }

  const source = readFileSync(sourcePath, 'utf8');
  if (!source.includes(`styleUrl: '${component}.css'`) || forbidden.test(source)) {
    throw new Error(`Inline style contract violation: ${component}`);
  }
}
