import { execFileSync } from 'node:child_process';

const ACCEPTANCE_MARKERS = [
  'image-quality-acceptance\\start-isolated-read.mjs',
  'image-quality-acceptance/start-isolated-read.mjs',
  'image-quality-acceptance\\vite.config.mjs',
  'image-quality-acceptance/vite.config.mjs',
];

export function listeningPids(port) {
  const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  const pids = new Set();
  const pattern = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`);
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (match) pids.add(Number(match[1]));
  }
  return [...pids];
}

export function commandLine(pid) {
  const output = execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`,
  ], { encoding: 'utf8' });
  return output.replace(/\/\/[^@\s/]+@/g, '//***@').trim();
}

export function commandMatchesAcceptance(command) {
  return ACCEPTANCE_MARKERS.some((marker) => command.includes(marker));
}

export function commandMatchesRun(command, { repoRoot, runToken, role }) {
  if (typeof command !== 'string' || command.trim() === '') return false;
  if (typeof repoRoot !== 'string' || repoRoot.trim() === '') return false;
  if (typeof runToken !== 'string' || !/^[a-f0-9]{32}$/.test(runToken)) return false;
  const normalized = command.toLowerCase();
  const root = repoRoot.toLowerCase();
  const rootSeen = normalized.includes(root.replaceAll('/', '\\'))
    || normalized.includes(root.replaceAll('\\', '/'));
  if (!rootSeen || !normalized.includes(runToken)) return false;
  if (role === 'api') return normalized.includes('start-isolated-read.mjs');
  if (role === 'vite') {
    return normalized.includes('vite-child.mjs') && normalized.includes('vite.config.mjs');
  }
  return false;
}
