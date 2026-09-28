import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface PluginPackageSignature {
  pluginId: string;
  version: string;
  packageSha256: string;
  algorithm: 'ed25519';
  publicKey: string;
  signature: string;
  signedAt: string;
}

export interface CatalogSignature {
  algorithm: 'ed25519';
  publicKey: string;
  signature: string;
  signedAt: string;
}

export type SignaturePolicy = 'enforce' | 'warn' | 'off';

function base64ToBuffer(value: string) {
  return Buffer.from(value, 'base64');
}

export function generateSigningKeyPair() {
  return crypto.generateKeyPairSync('ed25519');
}

export function signPayload(
  privateKey: crypto.KeyObject | string,
  payload: string | Buffer
): string {
  const key =
    typeof privateKey === 'string'
      ? crypto.createPrivateKey({ key: privateKey, format: 'pem', type: 'pkcs8' })
      : privateKey;
  return crypto
    .sign(null, Buffer.isBuffer(payload) ? payload : Buffer.from(payload), key)
    .toString('base64');
}

export function verifyPayload(
  publicKey: crypto.KeyObject | string,
  payload: string | Buffer,
  signatureBase64: string
): boolean {
  try {
    const key =
      typeof publicKey === 'string'
        ? crypto.createPublicKey({ key: publicKey, format: 'pem', type: 'spki' })
        : publicKey;
    return crypto.verify(
      null,
      Buffer.isBuffer(payload) ? payload : Buffer.from(payload),
      key,
      base64ToBuffer(signatureBase64)
    );
  } catch {
    return false;
  }
}

export function verifyPackageSignature(
  signature: PluginPackageSignature,
  packageSha256: string
): void {
  if (signature.algorithm !== 'ed25519') {
    throw new Error('PLUGIN_SIGNATURE_ALGORITHM_UNSUPPORTED');
  }
  if (
    !/^[0-9a-f]{64}$/i.test(signature.packageSha256) ||
    signature.packageSha256.toLowerCase() !== packageSha256.toLowerCase()
  ) {
    throw new Error('PLUGIN_SIGNATURE_PACKAGE_MISMATCH');
  }
  const payload = `${signature.pluginId}\n${signature.version}\n${signature.packageSha256.toLowerCase()}`;
  if (!verifyPayload(signature.publicKey, payload, signature.signature)) {
    throw new Error('PLUGIN_SIGNATURE_INVALID');
  }
}

export function verifyCatalogSignature(catalogRaw: string, signature: CatalogSignature): void {
  if (signature.algorithm !== 'ed25519') {
    throw new Error('PLUGIN_SIGNATURE_ALGORITHM_UNSUPPORTED');
  }
  if (!verifyPayload(signature.publicKey, catalogRaw, signature.signature)) {
    throw new Error('PLUGIN_CATALOG_SIGNATURE_INVALID');
  }
}

export async function readPackageSignature(
  pluginRoot: string
): Promise<PluginPackageSignature | null> {
  const signaturePath = path.join(pluginRoot, 'signature.json');
  try {
    const raw = await fs.readFile(signaturePath, 'utf8');
    return JSON.parse(raw) as PluginPackageSignature;
  } catch {
    return null;
  }
}

/**
 * Applies signature policy for a newly installed plugin package.
 * - enforce: missing or invalid signature fails install
 * - warn: missing signature is allowed; invalid signature fails
 * - off: signature is ignored
 */
export function evaluatePackageSignaturePolicy(
  policy: SignaturePolicy,
  signature: PluginPackageSignature | null,
  packageSha256: string
): { verified: boolean; warning?: string } {
  if (policy === 'off') return { verified: false };
  if (!signature) {
    if (policy === 'enforce') {
      throw new Error('PLUGIN_SIGNATURE_REQUIRED');
    }
    return { verified: false, warning: 'PLUGIN_SIGNATURE_MISSING' };
  }
  verifyPackageSignature(signature, packageSha256);
  return { verified: true };
}
