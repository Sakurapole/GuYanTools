import { describe, expect, it } from 'vitest';
import { parseAdbDevices } from './adb_parser';

describe('parseAdbDevices', () => {
  it('parses USB and TCP/IP devices with model metadata', () => {
    const devices = parseAdbDevices([
      'List of devices attached',
      'R58M1234567\tdevice usb:1-2 product:foo model:Pixel_8 device:husky',
      '192.168.1.20:5555\tdevice product:bar model:OnePlus_12 device:waffle',
      '',
    ].join('\n'));

    expect(devices).toEqual([
      {
        serial: 'R58M1234567',
        state: 'device',
        transport: 'adb-usb',
        model: 'Pixel 8',
        product: 'foo',
        usb: true,
      },
      {
        serial: '192.168.1.20:5555',
        state: 'device',
        transport: 'adb-tcpip',
        model: 'OnePlus 12',
        product: 'bar',
        usb: false,
      },
    ]);
  });

  it('parses the space-aligned output emitted by adb 37 on Windows', () => {
    expect(parseAdbDevices(
      'List of devices attached\r\nfcfa696a               device product:sheng model:24018RPACC device:sheng transport_id:6\r\n\r\n',
    )).toEqual([
      {
        serial: 'fcfa696a',
        state: 'device',
        transport: 'adb-usb',
        model: '24018RPACC',
        product: 'sheng',
        usb: true,
      },
    ]);
  });

  it('retains unauthorized and offline states without guessing malformed lines', () => {
    const devices = parseAdbDevices([
      'List of devices attached',
      'pending\tunauthorized usb:2-1',
      'stale\toffline',
      'this line is not a device row',
      '\tdevice',
    ].join('\n'));

    expect(devices).toEqual([
      { serial: 'pending', state: 'unauthorized', transport: 'adb-usb', usb: true },
      { serial: 'stale', state: 'offline', transport: 'adb-tcpip', usb: false },
    ]);
  });

  it('normalizes unknown adb states to unknown', () => {
    expect(parseAdbDevices('List of devices attached\nserial\tbootloader')).toEqual([
      { serial: 'serial', state: 'unknown', transport: 'adb-tcpip', usb: false },
    ]);
  });
});
