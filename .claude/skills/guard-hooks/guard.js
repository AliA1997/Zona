#!/usr/bin/env node
// PreToolUse guard. Reads the hook JSON from stdin; exit 2 blocks the call and sends stderr to Claude.
// Fails closed on a parse error for Bash (a guard that silently passes is worse than none).
'use strict';

const BASH_RULES = [
  [/\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*\s+)+(\/|~|\$HOME|[A-Za-z]:[\\/]?)(\s|$|\*)/, 'recursive delete of root, home, or a drive'],
  [/\brm\s+(-[a-zA-Z]*\s+)*(-r|-R|--recursive)\b.*\s(\.\.|\.git|\.claude)(\/|\s|$)/, 'recursive delete of parent, .git, or .claude'],
  [/\b(Remove-Item|ri|rd|rmdir|del)\b.*(-Recurse|\/s)\b.*([A-Za-z]:[\\/]?\s*$|\\Users\\?\s*$|~)/i, 'recursive delete of drive or home'],
  [/\bformat\s+[A-Za-z]:/i, 'disk format'],
  [/\b(mkfs|dd\s+if=.*of=\/dev\/)/, 'disk-destroying command'],
  [/\bgit\s+push\b/, 'git push (user must do this)'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\s+-[a-zA-Z]*[fdx]/, 'git clean'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'discarding all working-tree changes'],
  [/\bgit\s+branch\s+-D\b/, 'force-deleting a branch'],
  [/\bgit\s+.*--no-verify\b/, 'bypassing git hooks'],
  [/\bgit\s+.*--force(-with-lease)?\b|\bgit\s+.*\s-f(\s|$)/, 'forced git operation'],
  [/\b(curl|wget|iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^|;]*\|\s*(sh|bash|zsh|iex|Invoke-Expression|node|python3?)\b/i, 'piping a download into an interpreter'],
  [/\b(iex|Invoke-Expression)\b.*\b(DownloadString|iwr|irm|curl)\b/i, 'executing downloaded code'],
  [/\bnpm\s+(publish|unpublish|deprecate|owner|token)\b/, 'npm registry mutation'],
  [/\bnpx\s+eas(-cli)?\s+(submit|build\s.*--auto-submit)|\beas\s+(submit|update)\b/, 'EAS release step'],
  [/\b(cat|type|Get-Content|gc|more|less|head|tail|cp|copy|mv|move|scp|base64|xxd|strings|grep|rg|sed|awk|source|\.)\s+[^|;&]*(\.env(\.|\s|$|"|')|\.pem\b|\.key\b|id_rsa|id_ed25519|credentials\b|\.npmrc|\.netrc)/i, 'reading a secrets file'],
  [/\b(printenv|env|set|Get-ChildItem\s+env:)\s*$|\bprintenv\s+\w*(KEY|SECRET|TOKEN|PASSWORD)/i, 'dumping environment secrets'],
  [/\bchmod\s+(-R\s+)?777\b/, 'world-writable permissions'],
  [/\b(sudo|runas)\b/i, 'privilege escalation'],
  [/\b(reg\s+(delete|add)|schtasks\s+\/create|netsh\s+advfirewall|Set-ExecutionPolicy|Disable-WindowsOptionalFeature)\b/i, 'system configuration change'],
  [/\brm\s+-[a-zA-Z]*\s+.*node_modules\b|\b(Remove-Item|rd|rmdir)\b.*node_modules\b/i, 'deleting node_modules (installs here are very slow)'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
  [/>\s*\/dev\/(sd|nvme|disk)/, 'writing to a raw device'],
];

const SENSITIVE_PATH = /(^|[\\/])(\.env(\.[^\\/]*)?|[^\\/]*\.(pem|key|p12|pfx|keystore|jks)|id_rsa|id_ed25519|\.npmrc|\.netrc|credentials(\.json)?)$/i;
const PROTECTED_WRITE = /(^|[\\/])\.git[\\/]|(^|[\\/])\.claude[\\/]skills[\\/]guard-hooks[\\/]|(^|[\\/])\.claude[\\/]settings\.json$/i;
const ALLOWED_ENV = /\.env\.(example|sample|template)$/i;

function block(reason) {
  process.stderr.write(`Blocked by project guard hook: ${reason}. Do not retry or work around this; ask the user.\n`);
  process.exit(2);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    block('could not parse hook input');
  }
  const tool = input.tool_name;
  const args = input.tool_input || {};

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(args.command || '');
    for (const [re, why] of BASH_RULES) {
      if (re.test(cmd)) block(why);
    }
  } else if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = String(args.file_path || args.notebook_path || '');
    if (SENSITIVE_PATH.test(p) && !ALLOWED_ENV.test(p)) block(`${tool} on a secrets file (${p})`);
    if (tool !== 'Read' && PROTECTED_WRITE.test(p)) block(`${tool} on a protected path (${p})`);
  }
  process.exit(0);
});
