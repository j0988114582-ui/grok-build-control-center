import path from 'node:path'

export function parseGrokVersion(output: string): { version: string; revision?: string } | null {
  const match = output.trim().match(/^grok\s+([\d.]+)(?:\s+\(([^)]+)\))?/i)
  return match ? { version: match[1], revision: match[2] } : null
}

export function resolveGrokExecutable(configured: string | undefined, homeDir: string): string {
  return configured?.trim() || path.join(homeDir, '.grok', 'bin', 'grok.exe')
}

export const buildAgentArgs = (): string[] => ['agent', '--no-leader', 'stdio']
