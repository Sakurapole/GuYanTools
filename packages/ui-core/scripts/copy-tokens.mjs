import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

cpSync(resolve('src/tokens.css'), resolve('dist/tokens.css'));
