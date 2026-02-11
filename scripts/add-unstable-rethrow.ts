/**
 * Script to add unstable_rethrow to all API route handlers
 *
 * This ensures Next.js navigation functions (notFound, redirect) are properly rethrown
 * and not caught by generic error handlers.
 */

import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app', 'api');

/**
 * Recursively find all route.ts files
 */
function findRouteFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

interface FileUpdate {
  file: string;
  updated: boolean;
  reason?: string;
}

/**
 * Add unstable_rethrow to a route file's catch blocks
 */
function processFile(filePath: string): FileUpdate {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if already has unstable_rethrow import
  if (content.includes("from 'next/navigation'") && content.includes('unstable_rethrow')) {
    return { file: filePath, updated: false, reason: 'Already has unstable_rethrow import' };
  }

  // Check if file has catch blocks
  if (!content.includes('} catch')) {
    return { file: filePath, updated: false, reason: 'No catch blocks found' };
  }

  let updatedContent = content;
  let hasChanges = false;

  // Add import if not present
  if (!content.includes("from 'next/navigation'")) {
    // Find the import section (after existing imports)
    const importMatch = content.match(/(import\s+.*from\s+['"].*['"];?\s*\n)+/);
    if (importMatch) {
      const lastImportEnd = importMatch[0].length;
      updatedContent =
        content.slice(0, lastImportEnd) +
        "import { unstable_rethrow } from 'next/navigation';\n" +
        content.slice(lastImportEnd);
      hasChanges = true;
    }
  } else if (content.includes("from 'next/navigation'") && !content.includes('unstable_rethrow')) {
    // Add to existing next/navigation import
    updatedContent = updatedContent.replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]next\/navigation['"]/,
      (match, imports) => {
        return `import { ${imports.trim()}, unstable_rethrow } from 'next/navigation'`;
      }
    );
    hasChanges = true;
  }

  // Add unstable_rethrow as first line in catch blocks
  // Match: } catch (error...) { followed by optional whitespace
  updatedContent = updatedContent.replace(
    /\}\s+catch\s*\([^)]+\)\s*\{(\s*)/g,
    (match, whitespace) => {
      // Check if next non-whitespace line is already unstable_rethrow
      const nextLines = updatedContent.slice(updatedContent.indexOf(match) + match.length);
      if (nextLines.trimStart().startsWith('unstable_rethrow')) {
        return match; // Already has it
      }
      hasChanges = true;
      return match + 'unstable_rethrow(error);\n    ';
    }
  );

  if (hasChanges) {
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
    return { file: filePath, updated: true };
  }

  return { file: filePath, updated: false, reason: 'No changes needed' };
}

async function main() {
  console.log('🔍 Finding API route files...\n');

  // Find all route.ts files in app/api
  const files = findRouteFiles(APP_DIR);

  console.log(`Found ${files.length} route files\n`);

  const results: FileUpdate[] = [];

  for (const file of files) {
    const result = processFile(file);
    results.push(result);

    const relPath = path.relative(process.cwd(), file);
    if (result.updated) {
      console.log(`✅ ${relPath}`);
    } else {
      console.log(`⏭️  ${relPath} - ${result.reason}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Updated: ${results.filter(r => r.updated).length}`);
  console.log(`   Skipped: ${results.filter(r => !r.updated).length}`);
  console.log(`   Total:   ${results.length}`);
}

main().catch(console.error);
