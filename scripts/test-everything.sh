#!/bin/bash

echo "🎯 Complete Tidal Downloader Test Suite"
echo "======================================="
echo ""
echo "This will test:"
echo "✅ Backend Python script"
echo "🚀 Electron app startup"  
echo "🔄 Frontend-Backend integration"
echo "📊 Download progress monitoring"
echo "👤 Manual UI interaction"
echo ""

cd "$(dirname "$0")"

echo "🔥 Starting comprehensive test..."
chmod +x test-full-stack.js
node test-full-stack.js

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "🎉 FULL STACK TEST PASSED!"
    echo "✅ Your Tidal Downloader is working perfectly"
    echo "🚀 Ready for production use"
else
    echo "⚠️  Some issues detected in full stack test"
    echo "🔧 Check the output above for details"
fi

echo ""
echo "📝 Available test commands:"
echo "  ./test.sh              - Backend only test"
echo "  ./test-ui.sh           - UI interaction test"  
echo "  ./test-everything.sh   - This comprehensive test"

exit $exit_code