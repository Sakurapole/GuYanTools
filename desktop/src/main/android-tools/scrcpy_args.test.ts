import { describe, expect, it } from 'vitest';
import { buildAudioArgs, buildMirrorArgs, buildOtgArgs } from './scrcpy_args';

describe('scrcpy argument builders', () => {
  it('builds a UHID mirror/control command by default', () => {
    expect(buildMirrorArgs({ deviceSerial: 'ABC' })).toEqual([
      '--serial=ABC',
      '--keyboard=uhid',
      '--mouse=uhid',
    ]);
  });

  it('allows the caller to select SDK keyboard and mouse injection', () => {
    expect(buildMirrorArgs({ deviceSerial: 'ABC', keyboard: 'sdk', mouse: 'sdk' })).toEqual([
      '--serial=ABC',
      '--keyboard=sdk',
      '--mouse=sdk',
    ]);
  });

  it('builds audio-only playback and Android 13 duplication arguments', () => {
    expect(buildAudioArgs({ deviceSerial: 'ABC', sdkLevel: 33, duplicateOnDevice: true })).toEqual([
      '--serial=ABC',
      '--no-video',
      '--no-control',
      '--audio-source=playback',
      '--audio-dup',
    ]);
  });

  it('rejects audio duplication on Android versions below 13', () => {
    expect(() => buildAudioArgs({ deviceSerial: 'ABC', sdkLevel: 32, duplicateOnDevice: true }))
      .toThrow('ANDROID_AUDIO_UNSUPPORTED');
  });

  it('builds OTG arguments with explicit keyboard and mouse switches', () => {
    expect(buildOtgArgs({ deviceSerial: 'ABC', keyboard: true, mouse: false })).toEqual([
      '--serial=ABC',
      '--otg',
      '--keyboard=aoa',
      '--mouse=disabled',
    ]);
  });

  it('rejects empty or whitespace-only serials', () => {
    expect(() => buildMirrorArgs({ deviceSerial: '  ' })).toThrow('ANDROID_DEVICE_NOT_FOUND');
  });
});
