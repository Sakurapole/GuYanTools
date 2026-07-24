import type { Config } from '@stencil/core';
import { reactOutputTarget } from '@stencil/react-output-target';
import { vueOutputTarget } from '@stencil/vue-output-target';

export const config: Config = {
  namespace: 'guyantools',
  srcDir: 'src',
  globalStyle: 'src/global/gt-tokens.css',
  outputTargets: [
    {
      type: 'dist-custom-elements',
      dir: 'dist/custom-elements',
      externalRuntime: false,
      generateTypeDeclarations: true,
    },
    vueOutputTarget({
      componentCorePackage: '@guyantools/ui-core',
      proxiesFile: '../ui-vue/src/generated/stencil-proxies.ts',
      includeImportCustomElements: true,
      customElementsDir: 'dist/custom-elements',
    }),
    reactOutputTarget({
      stencilPackageName: '@guyantools/ui-core',
      outDir: '../plugin-ui/src/generated/react',
    }),
  ],
};
