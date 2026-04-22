const fs = require('node:fs');
const path = require('node:path');

const nativeArtifacts = fs.readdirSync(process.cwd()).filter((name) => name.endsWith('.node'));

for (const artifact of nativeArtifacts) {
  const artifactPath = path.resolve(process.cwd(), artifact);

  try {
    fs.unlinkSync(artifactPath);
  } catch (error) {
    if (error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      throw new Error(
        `Unable to remove ${artifact}. Close any running GuYanTools/Electron process that is using the native module, then retry.`
      );
    }

    throw error;
  }
}
