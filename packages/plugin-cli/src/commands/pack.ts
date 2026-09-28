import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { buildPlugin } from './build.js';

function signPackagePayload(
  pluginId: string,
  version: string,
  packageSha256: string,
  privateKeyPem: string
) {
  const key = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem', type: 'pkcs8' });
  const payload = `${pluginId}\n${version}\n${packageSha256.toLowerCase()}`;
  return crypto.sign(null, Buffer.from(payload), key).toString('base64');
}

export async function packPlugin(rootPath = process.cwd()) {
  const root = path.resolve(rootPath);
  const { manifest } = await buildPlugin(root);
  const staging = await fs.mkdtemp(path.join(root, '.guyantools-pack-'));
  const copy = async (name: string) => {
    const source = path.join(root, name);
    try {
      await fs.cp(source, path.join(staging, name), {
        recursive: true,
        filter: (sourcePath) =>
          !sourcePath.includes('node_modules') && !sourcePath.endsWith('.map'),
      });
    } catch {
      /* optional README/LICENSE */
    }
  };
  await copy('dist');
  await copy('guyantools.plugin.json');
  await copy('README.md');
  await copy('LICENSE');

  const privateKeyPem = process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
  let signaturePayload: Record<string, unknown> | undefined;
  if (privateKeyPem) {
    // Placeholder hash; final hash is computed after archive creation and rewritten.
    const placeholder = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    const signature = signPackagePayload(manifest.id, manifest.version, placeholder, privateKeyPem);
    const publicDer = crypto
      .createPublicKey(privateKeyPem)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    signaturePayload = {
      pluginId: manifest.id,
      version: manifest.version,
      packageSha256: placeholder,
      algorithm: 'ed25519',
      publicKey: publicDer,
      signature,
      signedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(staging, 'signature.json'),
      `${JSON.stringify(signaturePayload, null, 2)}\n`
    );
  }

  const archive = path.join(root, `${path.basename(root)}.zip`);
  await runPowerShellArchive(staging, archive);
  const hash = crypto
    .createHash('sha256')
    .update(await fs.readFile(archive))
    .digest('hex');

  if (privateKeyPem && signaturePayload) {
    // Re-sign with the real archive hash so host verification matches package bytes.
    const realSignature = signPackagePayload(manifest.id, manifest.version, hash, privateKeyPem);
    signaturePayload = {
      ...signaturePayload,
      packageSha256: hash,
      signature: realSignature,
    };
    await fs.writeFile(
      path.join(staging, 'signature.json'),
      `${JSON.stringify(signaturePayload, null, 2)}\n`
    );
    // Keep a sibling signature file next to the archive for catalog consumers.
    await fs.writeFile(
      path.join(root, 'signature.json'),
      `${JSON.stringify(signaturePayload, null, 2)}\n`
    );
  }

  await fs.writeFile(
    path.join(root, 'catalog-entry.json'),
    `${JSON.stringify(
      {
        id: manifest.id,
        version: manifest.version,
        permissions: manifest.permissions ?? [],
        capabilities: manifest.capabilities ?? [],
        dependencies: manifest.dependencies ?? [],
        archive: path.basename(archive),
        sha256: hash,
        ...(signaturePayload
          ? {
              signature: {
                algorithm: signaturePayload.algorithm,
                publicKey: signaturePayload.publicKey,
                signature: signaturePayload.signature,
                signedAt: signaturePayload.signedAt,
              },
            }
          : {}),
      },
      null,
      2
    )}\n`
  );
  await fs.rm(staging, { recursive: true, force: true });
  return { archive, sha256: hash, signed: Boolean(signaturePayload) };
}

async function runPowerShellArchive(staging: string, archive: string) {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${staging}\\*' -DestinationPath '${archive}' -Force`,
      ],
      { shell: false }
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`PLUGIN_PACK_FAILED: ${code}`))
    );
  });
}
