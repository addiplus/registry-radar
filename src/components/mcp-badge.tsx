'use client';

// MCP badge (plan section 7): renders "MCP server" text only; no tool count is
// ever rendered because packuments carry no tool manifest. When the package
// declares an official registry name, the badge links to the MCP registry.

interface McpBadgeProps {
  registryName: string | null;
}

const mcpClass =
  'inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium leading-4 text-accent';
const cliClass =
  'inline-flex items-center rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[11px] font-medium leading-4 text-muted';

const MCP_REGISTRY_URL = 'https://registry.modelcontextprotocol.io/';

export function McpBadge({ registryName }: McpBadgeProps) {
  if (registryName !== null) {
    return (
      <a
        href={MCP_REGISTRY_URL}
        target="_blank"
        rel="noopener noreferrer"
        title={`MCP registry name: ${registryName}`}
        onClick={(event) => event.stopPropagation()}
        className={`${mcpClass} hover:underline`}
      >
        MCP server
      </a>
    );
  }
  return <span className={mcpClass}>MCP server</span>;
}

export function CliBadge() {
  return <span className={cliClass}>CLI</span>;
}
