import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  generateSigningKeyPair,
  signPayload,
  verifyPayload,
  verifyPackageSignature,
  verifyCatalogSignature,
  evaluatePackageSignaturePolicy,
} from './plugin_signature';

function makeSignedPackage() {
  const { publicKey, privateKey } = generateSigningKeyPair();
  const pluginId = 'guyantools.demo';
  const version = '1.0.0';
  const packageSha256 = 'a'.repeat(64);
  const payload = `${pluginId}\n${version}\n${packageSha256}`;
  const signature = signPayload(privateKey, payload);
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey,
    packageSha256,
    signature: {
      pluginId,
      version,
      packageSha256,
      algorithm: 'ed25519' as const,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      signature,
      signedAt: new Date().toISOString(),
    },
  };
}

describe('plugin signature chain', () => {
  it('signs and verifies package payloads', () => {
    const signed = makeSignedPackage();
    expect(() => verifyPackageSignature(signed.signature, signed.packageSha256)).not.toThrow();
    expect(verifyPayload(signed.publicKey, 'hello', signPayload(signed.privateKey, 'hello'))).toBe(
      true
    );
  });

  it('rejects tampered package hashes and signatures', () => {
    const signed = makeSignedPackage();
    expect(() => verifyPackageSignature(signed.signature, 'b'.repeat(64))).toThrow(
      'PLUGIN_SIGNATURE_PACKAGE_MISMATCH'
    );
    expect(() =>
      verifyPackageSignature(
        { ...signed.signature, signature: Buffer.from('nope').toString('base64') },
        signed.packageSha256
      )
    ).toThrow('PLUGIN_SIGNATURE_INVALID');
  });

  it('verifies catalog signatures over raw catalog bytes', () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    const raw = JSON.stringify({
      schemaVersion: '1.0',
      marketplaceId: 'official',
      name: 'Official',
      plugins: [],
    });
    const signature = {
      algorithm: 'ed25519' as const,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      signature: signPayload(privateKey, raw),
      signedAt: new Date().toISOString(),
    };
    expect(() => verifyCatalogSignature(raw, signature)).not.toThrow();
    expect(() => verifyCatalogSignature(`${raw} `, signature)).toThrow(
      'PLUGIN_CATALOG_SIGNATURE_INVALID'
    );
  });

  it('applies enforce/warn signature policies', () => {
    const signed = makeSignedPackage();
    expect(() => evaluatePackageSignaturePolicy('enforce', null, signed.packageSha256)).toThrow(
      'PLUGIN_SIGNATURE_REQUIRED'
    );
    expect(evaluatePackageSignaturePolicy('warn', null, signed.packageSha256)).toMatchObject({
      verified: false,
      warning: 'PLUGIN_SIGNATURE_MISSING',
    });
    expect(
      evaluatePackageSignaturePolicy('enforce', signed.signature, signed.packageSha256).verified
    ).toBe(true);
    expect(evaluatePackageSignaturePolicy('off', null, signed.packageSha256).verified).toBe(false);
  });

  it('generates usable ed25519 key pairs', () => {
    const pair = generateSigningKeyPair();
    expect(pair.publicKey.asymmetricKeyType).toBe('ed25519');
    expect(pair.privateKey.asymmetricKeyType).toBe('ed25519');
    expect(crypto.randomBytes(8)).toHaveLength(8);
  });
});
