#!/bin/bash
# Comprehensive Test Suite for Real IP Support & Q3 Storage
# Tests all endpoints, reverse proxy, Q3 operations, and SSL

set -e  # Exit on error

API_BASE="http://localhost:7472"
FAILED_TESTS=0
PASSED_TESTS=0

echo "═══════════════════════════════════════════════════════"
echo "  🧪 Quantum Cloud - Test Suite"
echo "═══════════════════════════════════════════════════════"
echo ""

# Helper functions
test_pass() {
    echo "✅ $1"
    ((PASSED_TESTS++))
}

test_fail() {
    echo "❌ $1"
    ((FAILED_TESTS++))
}

test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo -n "Testing: $name... "
    
    if [ -z "$data" ]; then
        response=$(curl -s -X "$method" "$API_BASE$endpoint")
    else
        response=$(curl -s -X "$method" "$API_BASE$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    if [ $? -eq 0 ]; then
        test_pass "$name"
        echo "   Response: $(echo $response | jq -c '.' 2>/dev/null || echo $response | head -c 100)"
    else
        test_fail "$name"
    fi
}

echo "📡 Testing API Connectivity"
echo "─────────────────────────────────────────────────────"
test_api "API Health Check" "GET" "/api/status"
echo ""

echo "🌐 Testing Reverse Proxy"
echo "─────────────────────────────────────────────────────"
test_api "List Proxy Routes" "GET" "/api/proxy/routes"
echo ""

echo "🗄️  Testing Q3 Storage - Statistics"
echo "─────────────────────────────────────────────────────"
test_api "Get Q3 Stats" "GET" "/api/q3/stats"
echo ""

echo "🗄️  Testing Q3 Storage - Buckets"
echo "─────────────────────────────────────────────────────"
test_api "List Buckets (empty)" "GET" "/api/q3/buckets"

# Create test bucket
BUCKET_NAME="test-bucket-$(date +%s)"
test_api "Create Bucket" "POST" "/api/q3/buckets" "{\"name\":\"$BUCKET_NAME\"}"

test_api "List Buckets (with bucket)" "GET" "/api/q3/buckets"
echo ""

echo "📦 Testing Q3 Storage - Objects"
echo "─────────────────────────────────────────────────────"
test_api "Upload Object" "PUT" "/api/q3/$BUCKET_NAME/test.txt" "{\"data\":\"Hello Q3 Protocol!\"}"

test_api "List Objects" "GET" "/api/q3/$BUCKET_NAME/objects"

test_api "Download Object" "GET" "/api/q3/$BUCKET_NAME/test.txt"

test_api "Delete Object" "DELETE" "/api/q3/$BUCKET_NAME/test.txt"
echo ""

echo "🐳 Testing Droplet Creation"
echo "─────────────────────────────────────────────────────"
echo -n "Creating droplet... "
droplet_response=$(curl -s -X POST "$API_BASE/api/cloud/droplets" \
    -H "Content-Type: application/json" \
    -d '{"name":"test-droplet","image":"ubuntu-24-04-x64","size":"s-1vcpu-1gb","region":"lon1"}')

if echo "$droplet_response" | grep -q "id"; then
    test_pass "Droplet Created"
    echo "   Response: $(echo $droplet_response | jq -c '{id:.droplet.id,access_url:.droplet.access_url,public_url:.droplet.public_url}' 2>/dev/null)"
    
    # Check if public_url is set
    public_url=$(echo $droplet_response | jq -r '.droplet.public_url // empty' 2>/dev/null)
    if [ -n "$public_url" ] && [ "$public_url" != "null" ]; then
        test_pass "Public URL Assigned: $public_url"
    else
        test_fail "Public URL Not Assigned"
    fi
else
    test_fail "Droplet Creation"
    echo "   Response: $droplet_response"
fi
echo ""

echo "📊 Testing Q3 SDKs"
echo "─────────────────────────────────────────────────────"

# Test JavaScript SDK
if [ -f "q3-sdk.js" ]; then
    echo -n "Testing JS SDK... "
    if node q3-sdk.js stats >/dev/null 2>&1; then
        test_pass "JavaScript SDK"
    else
        test_fail "JavaScript SDK"
    fi
else
    test_fail "JavaScript SDK (file not found)"
fi

# Test Python SDK
if [ -f "q3_sdk.py" ]; then
    echo -n "Testing Python SDK... "
    if python3 q3_sdk.py stats >/dev/null 2>&1; then
        test_pass "Python SDK"
    else
        test_fail "Python SDK"
    fi
else
    test_fail "Python SDK (file not found)"
fi
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  📋 Test Summary"
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Passed: $PASSED_TESTS"
echo "  ❌ Failed: $FAILED_TESTS"
echo "  📊 Total:  $((PASSED_TESTS + FAILED_TESTS))"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED!"
    exit 0
else
    echo "⚠️  SOME TESTS FAILED"
    exit 1
fi
