#!/bin/bash

echo "🎯 Tidal Downloader Automated Test Suite"
echo "========================================"

cd "$(dirname "$0")"

# Make test script executable
chmod +x test-scenario.js

# Run the test
node test-scenario.js

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo ""
    echo "🎉 All tests completed successfully!"
    echo "✅ System is ready for production use"
else
    echo ""
    echo "❌ Some tests failed. Check the output above."
    echo "🔧 Please fix issues before using the system"
fi

exit $exit_code