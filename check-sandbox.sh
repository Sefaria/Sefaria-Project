#!/bin/bash
# Script to check if sandbox for commit 1e14f80 has been created
# Found sandbox: sandbox-1e14f80

COMMIT_SHA="1e14f80"
SHORT_SHA="1e14f80"
SANDBOX_NAME="sandbox-${SHORT_SHA}"

echo "=== Checking for sandbox: ${SANDBOX_NAME} ==="
echo "Commit: ${COMMIT_SHA}"
echo "URL: https://${SANDBOX_NAME}.cauldron.sefaria.org/health-check"
echo ""

echo "1. Checking 'sandboxes' namespace:"
RESOURCES=$(kubectl get all,helmreleases,rollouts -n sandboxes 2>&1 | grep -i "${SANDBOX_NAME}" || true)
if [ -z "$RESOURCES" ]; then
    echo "   ❌ No resources found"
else
    echo "   ✓ Found resources:"
    echo "$RESOURCES" | sed 's/^/   /'
fi

echo ""
echo "2. Checking 'default' namespace:"
RESOURCES=$(kubectl get all,helmreleases,rollouts -n default 2>&1 | grep -i "${SANDBOX_NAME}" || true)
if [ -z "$RESOURCES" ]; then
    echo "   ❌ No resources found"
else
    echo "   ✓ Found resources:"
    echo "$RESOURCES" | sed 's/^/   /'
fi

echo ""
echo "3. Checking pod status:"
PODS=$(kubectl get pods -n default 2>&1 | grep -i "${SANDBOX_NAME}" || true)
if [ -z "$PODS" ]; then
    echo "   ❌ No pods found"
else
    echo "   ✓ Pod status:"
    echo "$PODS" | sed 's/^/   /'
fi

echo ""
echo "4. Health check:"
HEALTH=$(curl -s -k https://${SANDBOX_NAME}.cauldron.sefaria.org/health-check 2>&1)
if [ $? -eq 0 ] && echo "$HEALTH" | grep -q "allReady"; then
    echo "   ✓ Health check passed:"
    echo "$HEALTH" | python3 -m json.tool 2>&1 | sed 's/^/   /' || echo "   $HEALTH"
else
    echo "   ❌ Health check failed or not ready"
fi

echo ""
echo "=== Summary ==="
TOTAL=$(kubectl get all,rollouts --all-namespaces 2>&1 | grep -i "${SANDBOX_NAME}" | wc -l | tr -d ' ')
if [ "$TOTAL" -gt 0 ]; then
    echo "✓ Sandbox ${SANDBOX_NAME} EXISTS with ${TOTAL} resource(s)"
    echo "✓ Located in: default namespace"
    echo "✓ Health check URL: https://${SANDBOX_NAME}.cauldron.sefaria.org/health-check"
else
    echo "❌ Sandbox ${SANDBOX_NAME} NOT FOUND"
fi
