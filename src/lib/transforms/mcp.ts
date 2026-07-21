import type { Packument, PackumentVersion } from './packument';

export interface McpSignal {
  isMcp: boolean;
  mcpRegistryName: string | null;
  hasCliBin: boolean;
}

const MCP_SDK = '@modelcontextprotocol/sdk';

// MCP badge derivation, build plan section 7. Rules evaluated in order:
// 1. @modelcontextprotocol/sdk in latest version dependencies or devDependencies.
// 2. mcpName on the latest version or top-level packument.
// 3. latest version bin exists and any bin key matches /mcp/i.
// 4. else false. A plain bin without "mcp" sets hasCliBin only.
// Tool counts are never derived: packuments carry no tool manifest.
export function deriveMcp(packument: Packument): McpSignal {
  const latest = packument['dist-tags']?.latest;
  const version = latest === undefined ? undefined : packument.versions?.[latest];

  const mcpRegistryName =
    typeof version?.mcpName === 'string'
      ? version.mcpName
      : typeof packument.mcpName === 'string'
        ? packument.mcpName
        : null;

  const keys = binKeys(version?.bin, version?.name ?? packument.name);
  const hasCliBin = keys.length > 0;

  const dependencies = version?.dependencies ?? {};
  const devDependencies = version?.devDependencies ?? {};

  let isMcp = false;
  if (MCP_SDK in dependencies || MCP_SDK in devDependencies) {
    isMcp = true;
  } else if (mcpRegistryName !== null) {
    isMcp = true;
  } else if (keys.some((key) => /mcp/i.test(key))) {
    isMcp = true;
  }

  return { isMcp, mcpRegistryName, hasCliBin };
}

// bin can be an object (keys are bin names) or a string shorthand whose
// implied bin name is the unscoped package name.
function binKeys(
  bin: PackumentVersion['bin'],
  packageName: string | undefined,
): string[] {
  if (bin === undefined || bin === null) return [];
  if (typeof bin === 'string') {
    if (bin.length === 0) return [];
    if (packageName === undefined || packageName.length === 0) return [];
    const unscoped = packageName.startsWith('@')
      ? (packageName.split('/')[1] ?? packageName)
      : packageName;
    return [unscoped];
  }
  return Object.keys(bin);
}
