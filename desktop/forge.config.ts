import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerWix } from '@electron-forge/maker-wix';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs/promises';
import path from 'node:path';

async function copyNativeCorePackageFiles(buildPath: string) {
  const coreRoot = path.resolve(__dirname, '..', 'multi_platform_core');
  const packageRoot = path.join(buildPath, 'node_modules', '@guyantools', 'core');
  const files = [
    'index.js',
    'index.d.ts',
    'package.json',
    'multi-platform-core.win32-x64-msvc.node',
    'multi-platform-core.win32-arm64-msvc.node',
    'multi-platform-core.darwin-x64.node',
    'multi-platform-core.darwin-arm64.node',
    'multi-platform-core.linux-x64-gnu.node',
    'multi-platform-core.linux-arm64-gnu.node',
  ];

  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });

  for (const file of files) {
    const source = path.join(coreRoot, file);
    try {
      await fs.copyFile(source, path.join(packageRoot, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && file.endsWith('.node')) {
        continue;
      }
      throw error;
    }
  }
}

function copyNativeCorePackage(
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (error?: Error | null) => void,
) {
  copyNativeCorePackageFiles(buildPath).then(() => callback()).catch(callback);
}

const config: ForgeConfig = {
  outDir: process.env.FORGE_OUT_DIR || undefined,
  packagerConfig: {
    asar: true,
    extraResource: [
      path.resolve(__dirname, 'src', 'assets', 'icons'),
    ],
    afterCopy: [copyNativeCorePackage],
  },
  rebuildConfig: {},
  makers: [
    new MakerWix(
      {
        language: 1033,
        manufacturer: 'Sakurapole',
        name: 'GuYanTools',
        exe: 'guyantools.exe',
        icon: path.resolve(__dirname, '..', 'mobile', 'windows', 'runner', 'resources', 'app_icon.ico'),
        shortcutFolderName: 'GuYanTools',
        shortcutName: 'GuYanTools',
        ui: {
          chooseDirectory: true,
        },
      },
      ['win32'],
    ),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Sakurapole',
          name: 'GuYanTools',
        },
        draft: false,
        prerelease: false,
        tagPrefix: 'v',
        force: true,
        generateReleaseNotes: true,
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/core/plugin_core/preload.plugin.ts',
          config: 'vite.preload-plugin.config.ts',
          target: 'preload',
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        }
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
