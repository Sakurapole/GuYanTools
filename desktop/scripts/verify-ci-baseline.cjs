const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(root, '.github/workflows/ci.yml');
const desktopPackagePath = path.join(root, 'desktop/package.json');

if (!fs.existsSync(workflowPath)) {
  console.error('Missing CI workflow: .github/workflows/ci.yml');
  process.exit(1);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));

for (const script of [
  'typecheck',
  'verify:encoding',
  'verify:features',
]) {
  if (!desktopPackage.scripts?.[script]) {
    console.error(`Missing desktop package script: ${script}`);
    process.exit(1);
  }
}

if (!desktopPackage.scripts['verify:features'].includes('verify:encoding')) {
  console.error('verify:features must include verify:encoding');
  process.exit(1);
}

for (const token of [
  'pull_request:',
  'push:',
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'pnpm/action-setup@v4',
  'actions/cache@v4',
  '~/.cargo/registry',
  '~/.cargo/git',
  'multi_platform_core/target',
  'pnpm install --frozen-lockfile',
  'pnpm --dir desktop run lint',
  'pnpm --dir desktop run typecheck',
  'pnpm --dir desktop run lint:design-system',
  'pnpm --dir desktop run verify:features',
  'cargo test --manifest-path multi_platform_core/Cargo.toml --features desktop-native',
]) {
  if (!workflow.includes(token)) {
    console.error(`Missing CI workflow token: ${token}`);
    process.exit(1);
  }
}

console.log('CI baseline workflow and desktop scripts verified.');
