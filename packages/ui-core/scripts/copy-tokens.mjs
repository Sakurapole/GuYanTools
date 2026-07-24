import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

cpSync(resolve('src/tokens.css'), resolve('dist/tokens.css'));
cpSync(resolve('src/styles'), resolve('dist/styles'), { recursive: true });
