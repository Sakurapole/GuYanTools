import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { buildPlugin } from './build.js';
import { validatePlugin } from './validate.js';

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
  await buildPlugin(root);
  const staging = await fs.mkdtemp(path.join(root, '.guyantools-pack-'));
  const copy = async (name: string) => {
    const source = path.join(root, name);
    await fs.cp(source, path.join(staging, name), {
      recursive: true,
      filter: async (sourcePath) => {
        if ((await fs.lstat(sourcePath)).isSymbolicLink())
          throw new Error(`PLUGIN_PACK_SYMLINK: ${path.relative(root, sourcePath)}`);
        return !sourcePath.split(path.sep).includes('node_modules') && !sourcePath.endsWith('.map');
      },
    });
  };
  try {
    await copy('dist');
    await fs.copyFile(
      path.join(staging, 'dist', 'guyantools.plugin.json'),
      path.join(staging, 'guyantools.plugin.json')
    );
    const manifest = await validatePlugin(staging);
    for (const optional of ['README.md', 'LICENSE']) {
      try {
        await fs.access(path.join(root, optional));
      } catch {
        continue;
      }
      await copy(optional);
    }

    const archive = path.join(root, `${path.basename(root)}.zip`);
    await runPowerShellArchive(staging, archive);
    const hash = crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');
    const privateKeyPem = process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
    const signaturePayload = privateKeyPem
      ? {
          pluginId: manifest.id,
          version: manifest.version,
          packageSha256: hash,
          algorithm: 'ed25519',
          publicKey: crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString(),
          signature: signPackagePayload(manifest.id, manifest.version, hash, privateKeyPem),
          signedAt: new Date().toISOString(),
        }
      : undefined;
    // The signature is detached: embedding an archive's hash in that archive is circular.
    if (signaturePayload)
      await fs.writeFile(path.join(root, 'signature.json'), `${JSON.stringify(signaturePayload, null, 2)}\n`);
    else
      await fs.rm(path.join(root, 'signature.json'), { force: true });
    await fs.writeFile(path.join(root, 'catalog-entry.json'), `${JSON.stringify({
      id: manifest.id,
      version: manifest.version,
      permissions: manifest.permissions ?? [],
      capabilities: manifest.capabilities ?? [],
      dependencies: manifest.dependencies ?? [],
      archive: path.basename(archive),
      sha256: hash,
      ...(signaturePayload ? { signature: {
        algorithm: signaturePayload.algorithm,
        publicKey: signaturePayload.publicKey,
        signature: signaturePayload.signature,
        signedAt: signaturePayload.signedAt,
      } } : {}),
    }, null, 2)}\n`);
    return { archive, sha256: hash, signed: Boolean(signaturePayload) };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function runPowerShellArchive(staging: string, archive: string) {
  await new Promise<void>((resolve, reject) => {
    const quotedStaging = staging.replaceAll("'", "''");
    const quotedArchive = archive.replaceAll("'", "''");
    const script = `$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath '${quotedStaging}'; Compress-Archive -Path '*' -DestinationPath '${quotedArchive}' -Force`;
    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { shell: false }
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`PLUGIN_PACK_FAILED: ${code}`))
    );
  });
}
