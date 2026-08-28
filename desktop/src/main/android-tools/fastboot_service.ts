import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AndroidDevice } from '@/contracts/android-tools';
import type { AndroidToolchainManager } from './toolchain';
import { buildFastbootDevicesArgs, buildFastbootGetvarArgs, buildFastbootRebootArgs } from './fastboot_args';

const execFile = promisify(nodeExecFile);
type Execute = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

function parseFastbootDevices(output: string): AndroidDevice[] {
  return output.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(\S+)\s+fastboot(?:\s+.*)?$/i);
    if (!match) return [];
    return [{ serial: match[1], state: 'bootloader', transport: 'fastboot-usb', usb: true } satisfies AndroidDevice];
  });
}

function parseGetvars(output: string) {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\(bootloader\)\s*([^:]+):\s*(.*?)\s*$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function assertFastbootSuccess(output: { stdout: string; stderr: string }) {
  if (/\bFAILED\b/i.test(`${output.stdout}\n${output.stderr}`)) {
    throw new Error('ANDROID_FASTBOOT_OPERATION_FAILED');
  }
}

export class FastbootService {
  private readonly toolchain: AndroidToolchainManager;
  private readonly executeCommand: Execute;

  constructor(toolchain: AndroidToolchainManager, options: { execute?: Execute } = {}) {
    this.toolchain = toolchain;
    this.executeCommand = options.execute ?? (async args => {
      const output = await execFile(this.toolchain.getToolPath('fastboot'), args, {
        windowsHide: true,
        maxBuffer: 512 * 1024,
      });
      return { stdout: output.stdout, stderr: output.stderr };
    });
  }

  async listDevices() {
    const output = await this.executeCommand(buildFastbootDevicesArgs());
    assertFastbootSuccess(output);
    return parseFastbootDevices(output.stdout);
  }

  async getVars(serial: string, names: string[]) {
    const device = (await this.listDevices()).find(item => item.serial === serial);
    if (!device) throw new Error('ANDROID_FASTBOOT_REQUIRED');

    const values: Record<string, string> = {};
    for (const name of Array.from(new Set(names))) {
      const output = await this.executeCommand(buildFastbootGetvarArgs(name));
      assertFastbootSuccess(output);
      Object.assign(values, parseGetvars(`${output.stdout}\n${output.stderr}`));
    }
    return values;
  }

  async reboot(serial: string, target?: 'system' | 'bootloader') {
    const device = (await this.listDevices()).find(item => item.serial === serial);
    if (!device) throw new Error('ANDROID_FASTBOOT_REQUIRED');
    const output = await this.executeCommand(buildFastbootRebootArgs(target));
    assertFastbootSuccess(output);
  }
}

