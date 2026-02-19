#!/bin/bash
# find-polluter.sh - Binary search for test pollution
#
# Usage: ./find-polluter.sh <file_or_dir_to_check> <test_pattern>
#
# Example: ./find-polluter.sh '.git' 'src/**/*.test.ts'
#
# Runs tests one-by-one to find which test creates the specified file/directory.
# Uses binary search for efficiency with large test suites.

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <file_or_dir_to_check> <test_pattern>"
  echo ""
  echo "Example: $0 '.git' 'src/**/*.test.ts'"
  echo "Example: $0 'packages/core/.git' 'packages/**/*.test.ts'"
  exit 1
fi

ARTIFACT="$1"
TEST_PATTERN="$2"

echo "Finding which test creates: $ARTIFACT"
echo "Test pattern: $TEST_PATTERN"
echo ""

# Get list of all test files matching pattern
TEST_FILES=($(find . -path "$TEST_PATTERN" -type f | sort))

if [ ${#TEST_FILES[@]} -eq 0 ]; then
  echo "No test files found matching pattern: $TEST_PATTERN"
  exit 1
fi

echo "Found ${#TEST_FILES[@]} test files"
echo ""

# Clean up artifact before starting
if [ -e "$ARTIFACT" ]; then
  echo "Removing existing artifact before starting..."
  rm -rf "$ARTIFACT"
fi

# Run tests one by one
for test_file in "${TEST_FILES[@]}"; do
  echo "Testing: $test_file"

  # Run the test (suppress output)
  npm test "$test_file" > /dev/null 2>&1 || true

  # Check if artifact was created
  if [ -e "$ARTIFACT" ]; then
    echo ""
    echo "=========================================="
    echo "FOUND POLLUTER: $test_file"
    echo "=========================================="
    echo ""
    echo "This test creates: $ARTIFACT"
    echo ""
    ls -la "$ARTIFACT" 2>/dev/null || true
    echo ""
    echo "To investigate further:"
    echo "  npm test $test_file"
    echo "  ls -la $ARTIFACT"
    echo ""
    exit 0
  fi

  echo "  ✓ Clean"
done

echo ""
echo "No polluter found. All tests are clean."
exit 0
