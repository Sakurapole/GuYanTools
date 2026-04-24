const path = require('node:path');
const { beforePack } = require('./scripts/electron-builder-hooks.cjs');

module.exports = {
  appId: 'com.sakurapole.guyantools',
  productName: 'GuYanTools',
  directories: {
    output: 'out',
  },
  files: [
    '.vite/build/**/*',
    '.vite/renderer/**/*',
    'package.json',
    'node_modules/**/*',
    '!node_modules/.cache/**/*',
    '!node_modules/**/{test,tests,__tests__}/**/*',
  ],
  extraResources: [
    {
      from: path.resolve(__dirname, 'src', 'assets', 'icons'),
      to: 'icons',
    },
  ],
  asar: true,
  asarUnpack: [
    'node_modules/@guyantools/core/*.node',
  ],
  beforePack,
  publish: [
    {
      provider: 'github',
      owner: 'Sakurapole',
      repo: 'GuYanTools',
      releaseType: 'release',
    },
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: 'GuYanTools-${version}-setup-${arch}.${ext}',
    icon: path.resolve(__dirname, '..', 'mobile', 'windows', 'runner', 'resources', 'app_icon.ico'),
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'GuYanTools',
  },
};
