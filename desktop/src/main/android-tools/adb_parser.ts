import type { AndroidDevice, AndroidDeviceState } from '@/contracts/android-tools';

const KNOWN_STATES = new Set<AndroidDeviceState>(['device', 'unauthorized', 'offline']);

function parseMetadata(tokens: string[]) {
  const metadata = new Map<string, string>();
  for (const token of tokens) {
    const separator = token.indexOf(':');
    if (separator <= 0) continue;
    metadata.set(token.slice(0, separator), token.slice(separator + 1));
  }
  return metadata;
}

export function parseAdbDevices(output: string): AndroidDevice[] {
  const devices: AndroidDevice[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line || line.startsWith('List of devices')) continue;

    const columns = line.trim().match(/^(\S+)\s+(\S+)(?:\s+(.+))?$/);
    if (!columns) continue;
    const serial = columns[1];
    const rawState = columns[2];
    if (!serial || !rawState) continue;

    const metadataTokens = columns[3]?.trim().split(/\s+/) ?? [];
    if (metadataTokens.length > 0 && !metadataTokens.some(token => token.includes(':'))) continue;
    const metadata = parseMetadata(metadataTokens);
    const usb = metadata.has('usb') || (metadata.has('transport_id') && !serial.includes(':'));
    const state = KNOWN_STATES.has(rawState as AndroidDeviceState)
      ? rawState as AndroidDeviceState
      : 'unknown';
    const model = metadata.get('model')?.replace(/_/g, ' ');
    devices.push({
      serial,
      state,
      transport: usb ? 'adb-usb' : 'adb-tcpip',
      ...(model ? { model } : {}),
      ...(metadata.get('product') ? { product: metadata.get('product') } : {}),
      usb,
    });
  }
  return devices;
}
