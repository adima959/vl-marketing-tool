import { appendFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE = join(process.cwd(), 'debug.log');

/**
 * Simple file logger for debugging
 * Appends messages to debug.log in project root
 */
export function logDebug(section: string, data: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n\n[$${timestamp}] === ${section} ===\n${JSON.stringify(data, null, 2)}\n`;

  try {
    appendFileSync(LOG_FILE, logEntry, 'utf8');
  } catch (error) {
    console.error('Failed to write to debug log:', error);
  }
}

/**
 * Clear the debug log file
 */
export function clearDebugLog() {
  const { writeFileSync } = require('fs');
  try {
    writeFileSync(LOG_FILE, '', 'utf8');
  } catch (error) {
    console.error('Failed to clear debug log:', error);
  }
}
