#!/usr/bin/env node

// PreToolUse hook: Blocks destructive git commands unless user explicitly requests them

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const cmd = input.tool_input?.command || '';

  if (!/git\s/.test(cmd)) process.exit(0);

  const dangerous = [
    { pattern: /push\s+.*--force/, msg: 'git push --force' },
    { pattern: /push\s+.*-f(?:\s|$)/, msg: 'git push -f' },
    { pattern: /reset\s+--hard/, msg: 'git reset --hard' },
    { pattern: /checkout\s+\./, msg: 'git checkout .' },
    { pattern: /restore\s+\./, msg: 'git restore .' },
    { pattern: /clean\s+-f/, msg: 'git clean -f' },
    { pattern: /--no-verify/, msg: '--no-verify (skips hooks)' },
    { pattern: /branch\s+-D/, msg: 'git branch -D (force delete)' },
  ];

  for (const { pattern, msg } of dangerous) {
    if (pattern.test(cmd)) {
      console.error(`[Hook] BLOCKED: ${msg} is a destructive command.`);
      console.error('[Hook] User must run this manually or give explicit approval.');
      process.exit(2);
    }
  }
});
