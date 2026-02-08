#!/usr/bin/env node

// PreToolUse hook: Warns on git push — shows diff stats as reminder
// Informational only (does not block)

const { execSync } = require('child_process');

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const cmd = input.tool_input?.command || '';

  if (!/git\s+push/.test(cmd)) process.exit(0);

  try {
    const stat = execSync('git diff --stat origin/main..HEAD', { encoding: 'utf8' });
    console.error('[Hook] Changes that would be pushed:\n' + stat);
  } catch (e) {
    console.error('[Hook] Could not diff against remote');
  }

  console.error('[Hook] WARNING: Make sure the user explicitly approved this push.');
});
