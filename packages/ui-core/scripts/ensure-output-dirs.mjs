import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Stencil's output targets write generated proxies in sibling workspace packages.
// Create those directories before a cold build so Windows cannot fail opening the
// generated React/Vue files when the parent folder has not been materialized yet.
for (const directory of [
  resolve('..', 'plugin-ui', 'src', 'generated', 'react'),
  resolve('..', 'ui-vue', 'src', 'generated'),
]) {
  mkdirSync(directory, { recursive: true });
}
