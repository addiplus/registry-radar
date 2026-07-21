import { describe, expect, it } from 'vitest';

import { deriveMcp } from '@/lib/transforms/mcp';
import type { Packument, PackumentVersion } from '@/lib/transforms/packument';

function packumentWith(
  version: PackumentVersion,
  top: Partial<Packument> = {},
): Packument {
  return {
    name: 'pkg',
    'dist-tags': { latest: '1.0.0' },
    versions: { '1.0.0': { version: '1.0.0', ...version } },
    ...top,
  };
}

describe('deriveMcp', () => {
  it('is true when the sdk is in dependencies', () => {
    const signal = deriveMcp(
      packumentWith({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } }),
    );
    expect(signal.isMcp).toBe(true);
    expect(signal.mcpRegistryName).toBeNull();
  });

  it('is true when the sdk is only in devDependencies', () => {
    const signal = deriveMcp(
      packumentWith({ devDependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } }),
    );
    expect(signal.isMcp).toBe(true);
  });

  it('is true when mcpName is present, and surfaces the registry name', () => {
    const fromVersion = deriveMcp(packumentWith({ mcpName: 'io.acme/pkg' }));
    expect(fromVersion.isMcp).toBe(true);
    expect(fromVersion.mcpRegistryName).toBe('io.acme/pkg');

    const fromTopLevel = deriveMcp(packumentWith({}, { mcpName: 'io.acme/top' }));
    expect(fromTopLevel.isMcp).toBe(true);
    expect(fromTopLevel.mcpRegistryName).toBe('io.acme/top');
  });

  it('is true when a bin key contains mcp', () => {
    const signal = deriveMcp(packumentWith({ bin: { 'mcp-server': './bin.js' } }));
    expect(signal.isMcp).toBe(true);
    expect(signal.hasCliBin).toBe(true);
  });

  it('is false for a plain bin without mcp, and sets hasCliBin only', () => {
    const signal = deriveMcp(packumentWith({ bin: { cli: './bin.js' } }));
    expect(signal.isMcp).toBe(false);
    expect(signal.hasCliBin).toBe(true);
  });

  it('is false when neither sdk, mcpName, nor bin is present', () => {
    const signal = deriveMcp(packumentWith({}));
    expect(signal).toEqual({ isMcp: false, mcpRegistryName: null, hasCliBin: false });
  });
});
