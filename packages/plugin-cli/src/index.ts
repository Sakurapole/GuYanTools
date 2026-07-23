#!/usr/bin/env node
import { createPlugin } from './commands/create.js';
import { devPlugin } from './commands/dev.js';
import { validatePlugin } from './commands/validate.js';
import { buildPlugin } from './commands/build.js';
import { packPlugin } from './commands/pack.js';

export { createPlugin } from './commands/create.js';
export { devPlugin } from './commands/dev.js';
export { validatePlugin } from './commands/validate.js';
export { buildPlugin } from './commands/build.js';
export { packPlugin } from './commands/pack.js';

async function main(args: string[]) {
  const [command, value] = args;
  if (command === 'create' && value) {
    const framework = args.includes('--framework') && args[args.indexOf('--framework') + 1] === 'react' ? 'react' : 'vue';
    console.log(await createPlugin(value, framework));
    return;
  }
  if (command === 'dev') { console.log(JSON.stringify(await devPlugin())); return; }
  if (command === 'validate') { console.log(JSON.stringify(await validatePlugin())); return; }
  if (command === 'build') { console.log(JSON.stringify(await buildPlugin())); return; }
  if (command === 'pack') { console.log(JSON.stringify(await packPlugin())); return; }
  throw new Error('Usage: guyantools-plugin <create|dev|validate|build|pack>');
}

if (process.argv[1]?.endsWith('index.js')) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
