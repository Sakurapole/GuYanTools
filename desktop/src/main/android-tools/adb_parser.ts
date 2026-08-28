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

    const columns = line.split('\t');
    if (columns.length < 2) continue;
    const serial = columns[0].trim();
    const rawState = columns[1].trim().split(/\s+/, 1)[0];
    if (!serial || !rawState) continue;

    const metadata = parseMetadata(columns.slice(1).join(' ').trim().split(/\s+/));
    const usb = metadata.has('usb');
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

