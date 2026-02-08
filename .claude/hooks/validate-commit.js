#!/usr/bin/env node

// PreToolUse hook: Validates git commit message format
// Requires: HEREDOC format, Co-Authored-By line, type prefix

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const cmd = input.tool_input?.command || '';

  // Only check git commit commands
  if (!/git\s+commit/.test(cmd)) process.exit(0);

  const errors = [];

  // Must use HEREDOC format
  if (!/\$\(cat\s+<</.test(cmd)) {
    errors.push('Must use HEREDOC format: git commit -m "$(cat <<\'EOF\' ... EOF )"');
  }

  // Must have Co-Authored-By
  if (!/Co-Authored-By:/.test(cmd)) {
    errors.push('Must include Co-Authored-By line');
  }

  // Must start with valid type prefix
  if (!/(?:feat|fix|docs|refactor|test|chore)\s*:/.test(cmd)) {
    errors.push('Message must start with type: feat:|fix:|docs:|refactor:|test:|chore:');
  }

  if (errors.length) {
    console.error('[Hook] Commit message validation failed:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(2);
  }
});
