#!/bin/bash
# Script to update the Google OAuth2 client secret in the Sefaria/infrastructure repository
# This script handles SOPS encryption and git workflow
# 
# Usage: ./update_infrastructure_google_secret.sh <path_to_client_secrets.json>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

INFRASTRUCTURE_REPO="$HOME/infrastructure"
SECRET_FILE="dev/cluster-1/spec/default/google-client-secret.yaml"
BRANCH_NAME="update-google-client-secret-$(date +%Y%m%d-%H%M%S)"

function show_usage() {
    echo "Usage: $0 <path_to_client_secrets.json>"
    echo ""
    echo "Example:"
    echo "  $0 ~/google-cloud-secret/client_secrets.json"
    exit 1
}

function check_prerequisites() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}:mag: Checking Prerequisites${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check SOPS
    if ! command -v sops &> /dev/null; then
        echo -e "${RED}:x: SOPS is not installed${NC}"
        echo -e "${YELLOW}Install with: brew install sops${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ SOPS installed${NC}"
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}:x: jq is not installed${NC}"
        echo -e "${YELLOW}Install with: brew install jq${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ jq installed${NC}"
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}:x: gcloud is not installed${NC}"
        echo -e "${YELLOW}Install from: https://cloud.google.com/sdk/docs/install${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ gcloud installed${NC}"
    
    # Check infrastructure repo
    if [ ! -d "$INFRASTRUCTURE_REPO" ]; then
        echo -e "${RED}:x: Infrastructure repo not found at $INFRASTRUCTURE_REPO${NC}"
        echo -e "${YELLOW}Clone with: git clone git@github.com:Sefaria/infrastructure.git ~/infrastructure${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Infrastructure repo found${NC}"
    
    # Test SOPS decryption
    if ! sops --decrypt "$INFRASTRUCTURE_REPO/$SECRET_FILE" &> /dev/null; then
        echo -e "${RED}:x: Cannot decrypt secret. Check your GCP permissions for project development-205018${NC}"
        echo -e "${YELLOW}You need access to: projects/development-205018/locations/global/keyRings/sops/cryptoKeys/sops-key${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ SOPS decryption works${NC}"
    
    echo ""
}

function show_diff() {
    local NEW_SECRET_FILE="$1"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}:bar_chart: Changes Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Extract current secret
    sops --decrypt "$INFRASTRUCTURE_REPO/$SECRET_FILE" | \
        grep "client_secrets.json:" | cut -d: -f2 | xargs | base64 -d > /tmp/current_secret.json
    
    echo ""
    echo -e "${CYAN}:round_pushpin: NEW Redirect URIs (will be added):${NC}"
    comm -13 <(jq -r '.web.redirect_uris[]' /tmp/current_secret.json | sort) \
             <(jq -r '.web.redirect_uris[]' "$NEW_SECRET_FILE" | sort) | sed 's/^/  ✓ /'
    
    echo ""
    echo -e "${CYAN}:round_pushpin: NEW JavaScript Origins (will be added):${NC}"
    comm -13 <(jq -r '.web.javascript_origins[]' /tmp/current_secret.json | sort) \
             <(jq -r '.web.javascript_origins[]' "$NEW_SECRET_FILE" | sort) | sed 's/^/  ✓ /'
    
    # Check for removals
    local REMOVED_URIS=$(comm -23 <(jq -r '.web.redirect_uris[]' /tmp/current_secret.json | sort) \
                                  <(jq -r '.web.redirect_uris[]' "$NEW_SECRET_FILE" | sort))
    if [ -n "$REMOVED_URIS" ]; then
        echo ""
        echo -e "${YELLOW}:warning:  Redirect URIs that will be REMOVED:${NC}"
        echo "$REMOVED_URIS" | sed 's/^/  ✗ /'
    fi
    
    local REMOVED_ORIGINS=$(comm -23 <(jq -r '.web.javascript_origins[]' /tmp/current_secret.json | sort) \
                                     <(jq -r '.web.javascript_origins[]' "$NEW_SECRET_FILE" | sort))
    if [ -n "$REMOVED_ORIGINS" ]; then
        echo ""
        echo -e "${YELLOW}:warning:  JavaScript Origins that will be REMOVED:${NC}"
        echo "$REMOVED_ORIGINS" | sed 's/^/  ✗ /'
    fi
    
    echo ""
}

function update_secret() {
    local NEW_SECRET_FILE="$1"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}:arrows_counterclockwise: Updating Infrastructure Repository${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    cd "$INFRASTRUCTURE_REPO"
    
    # Ensure we're on main and up to date
    echo -e "${YELLOW}:inbox_tray: Updating main branch...${NC}"
    git checkout main
    git pull origin main
    
    # Create new branch
    echo -e "${YELLOW}:herb: Creating new branch: $BRANCH_NAME${NC}"
    git checkout -b "$BRANCH_NAME"
    
    # Base64 encode the new secret content
    echo -e "${YELLOW}:closed_lock_with_key: Encoding secret...${NC}"
    NEW_SECRET_B64=$(cat "$NEW_SECRET_FILE" | base64)
    
    # Decrypt, update, and re-encrypt
    echo -e "${YELLOW}:arrows_counterclockwise: Decrypting current secret...${NC}"
    sops --decrypt "$SECRET_FILE" > /tmp/decrypted_secret.yaml
    
    echo -e "${YELLOW}:pencil2:  Updating secret content...${NC}"
    # Update the base64 encoded content in the YAML
    sed -i.bak "s|client_secrets.json:.*|client_secrets.json: $NEW_SECRET_B64|" /tmp/decrypted_secret.yaml
    
    echo -e "${YELLOW}:closed_lock_with_key: Re-encrypting with SOPS...${NC}"
    sops --encrypt \
        --gcp-kms "projects/development-205018/locations/global/keyRings/sops/cryptoKeys/sops-key" \
        --encrypted-regex '^(data|stringData)$' \
        /tmp/decrypted_secret.yaml > "$SECRET_FILE"
    
    # Show git diff (will show encrypted content, but shows file was modified)
    echo ""
    echo -e "${CYAN}:memo: Git Status:${NC}"
    git status --short
    
    echo ""
    echo -e "${CYAN}:clipboard: Modified Files:${NC}"
    git diff --stat
    
    echo ""
    echo -e "${GREEN}:white_check_mark: Secret updated successfully in local branch!${NC}"
    echo ""
    
    # Cleanup
    rm -f /tmp/decrypted_secret.yaml /tmp/decrypted_secret.yaml.bak /tmp/current_secret.json
}

function show_next_steps() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}:clipboard: Next Steps${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}1. Review the changes:${NC}"
    echo -e "   ${CYAN}cd $INFRASTRUCTURE_REPO${NC}"
    echo -e "   ${CYAN}sops --decrypt $SECRET_FILE | grep client_secrets.json | cut -d: -f2 | xargs | base64 -d | jq .${NC}"
    echo ""
    echo -e "${YELLOW}2. Commit the changes:${NC}"
    echo -e "   ${CYAN}cd $INFRASTRUCTURE_REPO${NC}"
    echo -e "   ${CYAN}git add $SECRET_FILE${NC}"
    echo -e "   ${CYAN}git commit -m 'Update Google OAuth2 client secret with staging/modularization domains'${NC}"
    echo ""
    echo -e "${YELLOW}3. Push the branch:${NC}"
    echo -e "   ${CYAN}git push origin $BRANCH_NAME${NC}"
    echo ""
    echo -e "${YELLOW}4. Create a Pull Request:${NC}"
    echo -e "   ${CYAN}https://github.com/Sefaria/infrastructure/compare/$BRANCH_NAME?expand=1${NC}"
    echo ""
    echo -e "${YELLOW}5. After PR is merged, Flux will automatically:${NC}"
    echo -e "   ${GREEN}✓${NC} Reconcile within 5 minutes"
    echo -e "   ${GREEN}✓${NC} Update the secret in the cluster"
    echo -e "   ${GREEN}✓${NC} No need to manually restart pods"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Main execution
if [ -z "$1" ]; then
    show_usage
fi

NEW_SECRET_FILE="$1"

# Validate file exists
if [ ! -f "$NEW_SECRET_FILE" ]; then
    echo -e "${RED}:x: Error: File '$NEW_SECRET_FILE' not found!${NC}"
    exit 1
fi

# Validate JSON
if ! jq empty "$NEW_SECRET_FILE" 2>/dev/null; then
    echo -e "${RED}:x: Error: File '$NEW_SECRET_FILE' is not valid JSON!${NC}"
    exit 1
fi

# Run checks
check_prerequisites

# Show what will change
show_diff "$NEW_SECRET_FILE"

# Ask for confirmation
echo ""
read -p "$(echo -e ${YELLOW}Do you want to proceed with updating the infrastructure repo? [y/N]: ${NC})" -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}:x: Update cancelled${NC}"
    exit 0
fi

# Perform the update
update_secret "$NEW_SECRET_FILE"

# Show next steps
show_next_steps

echo ""
echo -e "${GREEN}:sparkles: Done! Your changes are ready to commit and push.${NC}"
echo ""
