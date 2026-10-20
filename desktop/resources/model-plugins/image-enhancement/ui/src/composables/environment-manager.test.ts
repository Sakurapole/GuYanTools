import { describe, expect, it } from 'vitest';
import type { ModelPythonEnvironment } from '../../../../../../src/contracts/plugin_model';
import {
  environmentManagerOf,
  selectManagerEnvironment,
  packageManagersFor,
} from './environment-manager';

const environments: ModelPythonEnvironment[] = [
  { id: 'base', label: 'System', pythonPath: 'python.exe', version: '3.10.14', kind: 'system' },
  {
    id: 'conda',
    label: 'Conda',
    pythonPath: 'conda/python.exe',
    version: '3.10.14',
    kind: 'conda',
    manager: 'conda',
    managed: true,
    active: true,
  },
  {
    id: 'uv',
    label: 'uv',
    pythonPath: 'uv/python.exe',
    version: '3.10.14',
    kind: 'uv',
    manager: 'uv',
    managed: true,
  },
  {
    id: 'external',
    label: 'External venv',
    pythonPath: 'external/python.exe',
    version: '3.10.14',
    kind: 'venv',
    managed: false,
  },
];

describe('runtime environment manager selection', () => {
  it('keeps uv distinct from venv and does not place system interpreters in a managed list', () => {
    expect(environments.map(environmentManagerOf)).toEqual([undefined, 'conda', 'uv', 'venv']);
    expect(environmentManagerOf({ ...environments[2], kind: 'venv', manager: 'uv' })).toBe('uv');
    expect(
      environmentManagerOf({ ...environments[0], kind: 'managed', condaPath: 'conda.exe' })
    ).toBe('conda');
  });
  it('never reuses an active or selected environment from another manager', () => {
    expect(selectManagerEnvironment(environments, 'uv', 'conda', 'conda')).toBe('uv');
    expect(selectManagerEnvironment(environments, 'venv', 'conda', 'conda')).toBe('');
  });
  it('preserves an explicitly selected external environment but does not select it automatically', () => {
    expect(selectManagerEnvironment(environments, 'venv', 'external')).toBe('external');
    expect(selectManagerEnvironment(environments, 'venv')).toBe('');
  });
  it('limits package tools to the selected environment manager', () => {
    expect(packageManagersFor('venv')).toEqual(['pip']);
    expect(packageManagersFor('uv')).toEqual(['uv']);
    expect(packageManagersFor('conda')).toEqual(['conda', 'pip']);
  });
});
