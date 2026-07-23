import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
await fs.copyFile(path.join(root, 'src', 'tokens.css'), path.join(root, 'dist', 'tokens.css'));
