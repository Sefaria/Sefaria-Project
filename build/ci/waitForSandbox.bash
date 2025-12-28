#!/bin/bash

# AUTOMATICALLY PROVIDED
# GITHUB_HASH
waitDuration=${WAIT_DURATION:-900}

SANDBOX_URL="https://sandbox-${GIT_COMMIT}.cauldron.sefaria.org/health-check"

echo "========================================="

echo "Sandbox Wait Script Starting"

echo "========================================="

echo "GIT_COMMIT: ${GIT_COMMIT}"

echo "Target URL: ${SANDBOX_URL}"

echo "Wait Duration: ${waitDuration} seconds"

echo "Start Time: $(date)"

echo "========================================="

 

# Function to check the sandbox and log details

check_sandbox() {

    local attempt=0

    local start_time=$(date +%s)

 

    while true; do

        attempt=$((attempt + 1))

        local current_time=$(date +%s)

        local elapsed=$((current_time - start_time))

 

        echo "[Attempt ${attempt}] Elapsed: ${elapsed}s - Checking ${SANDBOX_URL}"

 

        # Perform curl with detailed output

        local http_code=$(curl -s -k -o /tmp/sandbox_response.txt -w '%{http_code}' "${SANDBOX_URL}" 2>/tmp/sandbox_error.txt)

        local curl_exit=$?

 

        echo "  HTTP Code: ${http_code}"

        echo "  Curl Exit Code: ${curl_exit}"

 

        # Log curl errors if any

        if [ -s /tmp/sandbox_error.txt ]; then

            echo "  Curl Errors:"

            cat /tmp/sandbox_error.txt | sed 's/^/    /'

        fi

 

        # Log response body if present

        if [ -s /tmp/sandbox_response.txt ]; then

            echo "  Response Body (first 200 chars):"

            head -c 200 /tmp/sandbox_response.txt | sed 's/^/    /'

            echo ""

        fi

 

        # Check if we got a 200 response

        if [[ "${http_code}" == "200" ]]; then

            echo "========================================="

            echo "SUCCESS: Sandbox is ready!"

            echo "Total wait time: ${elapsed} seconds"

            echo "Total attempts: ${attempt}"

            echo "End Time: $(date)"

            echo "========================================="

            return 0

        fi

 

        # Check if we've exceeded the timeout

        if [ ${elapsed} -ge ${waitDuration} ]; then

            echo "========================================="

            echo "TIMEOUT: Sandbox did not become ready in ${waitDuration} seconds"

            echo "Total attempts: ${attempt}"

            echo "Last HTTP code: ${http_code}"

            echo "End Time: $(date)"

            echo "========================================="

 

            # Try DNS resolution check

            echo "DNS Resolution Check:"

            nslookup "sandbox-${GIT_COMMIT}.cauldron.sefaria.org" || echo "  DNS resolution failed"

 

            # Try ping check

            echo "Ping Check:"

            ping -c 3 "sandbox-${GIT_COMMIT}.cauldron.sefaria.org" || echo "  Ping failed"

 

            return 1

        fi

 

        sleep 5

    done

}

 

# Run the check with timeout

timeout ${waitDuration} bash -c "$(declare -f check_sandbox); check_sandbox"

exit_code=$?

 

if [ ${exit_code} -eq 0 ]; then

    echo "Reached server. Proceeding."

    exit 0

else

    echo "Failed to reach server within timeout period"

    exit 1

fi
