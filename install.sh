#!/bin/bash
#
# git-ai Quick Install Script
# 
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/mars167/git-ai-cli/main/install.sh | bash
#
# Or with options:
#   curl -fsSL https://raw.githubusercontent.com/mars167/git-ai-cli/main/install.sh | bash -s -- --with-skill
#
# This script installs:
#   1. git-ai CLI tool (via npm)
#   2. Optionally: git-ai-mcp skill for AI agents
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Banner
print_banner() {
    echo -e "${CYAN}"
    echo '   ____   _   _             _    ___ '
    echo '  / ___| (_) | |_          / \  |_ _|'
    echo ' | |  _  | | | __|  ___   / _ \  | | '
    echo ' | |_| | | | | |_  |___| / ___ \ | | '
    echo '  \____| |_|  \__|      /_/   \_\___|'
    echo -e "${NC}"
    echo -e "${BOLD}Semantic Code Understanding for AI Agents${NC}"
    echo ""
}

# Logging functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Parse arguments
INSTALL_SKILL=false
GLOBAL_INSTALL=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --with-skill|-s)
            INSTALL_SKILL=true
            shift
            ;;
        --local|-l)
            GLOBAL_INSTALL=false
            shift
            ;;
        --help|-h)
            echo "Usage: install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --with-skill, -s    Also install git-ai-mcp skill for AI agents"
            echo "  --local, -l         Install locally instead of globally"
            echo "  --help, -h          Show this help message"
            exit 0
            ;;
        *)
            warn "Unknown option: $1"
            shift
            ;;
    esac
done

# Main installation
main() {
    print_banner
    
    # Check prerequisites
    info "Checking prerequisites..."
    
    if ! command_exists node; then
        error "Node.js is required but not installed. Please install Node.js 18+ first."
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js 18+ is required. Current version: $(node -v)"
    fi
    success "Node.js $(node -v) detected"
    
    if ! command_exists npm; then
        error "npm is required but not installed."
    fi
    success "npm $(npm -v) detected"
    
    # Install git-ai
    info "Installing git-ai CLI..."
    
    if [ "$GLOBAL_INSTALL" = true ]; then
        npm install -g git-ai
        success "git-ai installed globally"
    else
        npm install git-ai
        success "git-ai installed locally"
    fi
    
    # Verify installation
    if command_exists git-ai; then
        success "git-ai $(git-ai --version 2>/dev/null || echo 'installed')"
    else
        warn "git-ai command not found in PATH. You may need to restart your terminal."
    fi
    
    # Install skill if requested
    if [ "$INSTALL_SKILL" = true ]; then
        info "Installing git-ai-mcp skill..."
        
        if ! command_exists npx; then
            warn "npx not found. Skipping skill installation."
        else
            # Check if skills CLI is available
            if npx skills --version >/dev/null 2>&1; then
                npx skills add mars167/git-ai-cli@git-ai-mcp -g -y
                success "git-ai-mcp skill installed"
            else
                info "Installing skills CLI..."
                npx skills add mars167/git-ai-cli@git-ai-mcp -g -y
                success "git-ai-mcp skill installed"
            fi
        fi
    fi
    
    # Print next steps
    echo ""
    echo -e "${GREEN}${BOLD}Installation Complete!${NC}"
    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo ""
    echo "  1. Initialize index in your project:"
    echo -e "     ${CYAN}cd your-project${NC}"
    echo -e "     ${CYAN}git-ai ai index --overwrite${NC}"
    echo ""
    echo "  2. Search code semantically:"
    echo -e "     ${CYAN}git-ai ai semantic \"user authentication\"${NC}"
    echo ""
    echo "  3. Analyze call graphs:"
    echo -e "     ${CYAN}git-ai ai graph callers functionName${NC}"
    echo ""
    
    if [ "$INSTALL_SKILL" = false ]; then
        echo -e "${BOLD}For AI Agent Integration:${NC}"
        echo ""
        echo "  Install the MCP skill for Claude/Cursor/etc:"
        echo -e "     ${CYAN}curl -fsSL https://raw.githubusercontent.com/mars167/git-ai-cli/main/install.sh | bash -s -- --with-skill${NC}"
        echo ""
    fi
    
    echo -e "${BOLD}Documentation:${NC}"
    echo "  https://github.com/mars167/git-ai-cli"
    echo ""
}

# Run main
main
