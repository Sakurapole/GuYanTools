type InputMode = 'sdk' | 'uhid';

interface MirrorArgsInput {
  deviceSerial: string;
  keyboard?: InputMode;
  mouse?: InputMode;
}

interface AudioArgsInput {
  deviceSerial?: string;
  serial?: string;
  sdkLevel?: number;
  duplicateOnDevice?: boolean;
}

interface OtgArgsInput {
  deviceSerial: string;
  keyboard?: boolean;
  mouse?: boolean;
}

function normalizeSerial(serial: string) {
  const normalized = serial.trim();
  if (!normalized || normalized.length > 256 || /[\r\n]/.test(normalized)) {
    throw new Error('ANDROID_DEVICE_NOT_FOUND');
  }
  return normalized;
}

export function buildMirrorArgs(input: MirrorArgsInput) {
  const serial = normalizeSerial(input.deviceSerial);
  const keyboard = input.keyboard ?? 'uhid';
  const mouse = input.mouse ?? 'uhid';
  return [`--serial=${serial}`, `--keyboard=${keyboard}`, `--mouse=${mouse}`];
}

export function buildAudioArgs(input: AudioArgsInput) {
  const serial = normalizeSerial(input.deviceSerial ?? input.serial ?? '');
  const args = [`--serial=${serial}`, '--no-video', '--no-control'];
  if (input.duplicateOnDevice) {
    if (!input.sdkLevel || input.sdkLevel < 33) {
      throw new Error('ANDROID_AUDIO_UNSUPPORTED');
    }
    args.push('--audio-source=playback', '--audio-dup');
  }
  return args;
}

export function buildOtgArgs(input: OtgArgsInput) {
  const serial = normalizeSerial(input.deviceSerial);
  return [
    `--serial=${serial}`,
    '--otg',
    `--keyboard=${input.keyboard === false ? 'disabled' : 'aoa'}`,
    `--mouse=${input.mouse === false ? 'disabled' : 'aoa'}`,
  ];
}
