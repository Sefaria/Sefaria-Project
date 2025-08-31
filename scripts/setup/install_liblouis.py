#!/usr/bin/env python3
"""
Cross-platform liblouis installation script.

This script downloads and installs liblouis from source, handling platform-specific
requirements automatically.

Usage:
    python scripts/setup/install_liblouis.py [--version VERSION] [--python-path PATH]
"""

import os
import sys
import subprocess
import tempfile
import shutil
import argparse
import platform
from pathlib import Path
import urllib.request
import tarfile


class LibLouisInstaller:
    """Cross-platform liblouis installer."""
    
    def __init__(self, version="3.34.0", python_path=None):
        self.version = version
        self.python_path = python_path or sys.executable
        self.system = platform.system().lower()
        self.machine = platform.machine().lower()
        
    def check_prerequisites(self):
        """Check if required tools are available."""
        required_tools = ['gcc', 'make']
        
        for tool in required_tools:
            if not shutil.which(tool):
                raise RuntimeError(f"Required tool '{tool}' not found. Please install build tools.")
    
    def download_source(self, temp_dir):
        """Download liblouis source code."""
        url = f"https://github.com/liblouis/liblouis/releases/download/v{self.version}/liblouis-{self.version}.tar.gz"
        archive_path = os.path.join(temp_dir, f"liblouis-{self.version}.tar.gz")
        
        print(f"Downloading liblouis {self.version}...")
        urllib.request.urlretrieve(url, archive_path)
        
        # Extract
        print("Extracting source code...")
        with tarfile.open(archive_path, 'r:gz') as tar:
            tar.extractall(temp_dir)
        
        return os.path.join(temp_dir, f"liblouis-{self.version}")
    
    def build_liblouis(self, source_dir):
        """Build liblouis library."""
        print("Configuring liblouis...")
        
        # Configure
        configure_cmd = ["./configure"]
        if self.system == "darwin":
            # On macOS, use Homebrew prefix if available
            brew_prefix = self._get_brew_prefix()
            if brew_prefix:
                configure_cmd.extend(["--prefix", brew_prefix])
        
        subprocess.run(configure_cmd, cwd=source_dir, check=True)
        
        print("Building liblouis...")
        subprocess.run(["make"], cwd=source_dir, check=True)
    
    def install_python_bindings(self, source_dir):
        """Install Python bindings."""
        python_dir = os.path.join(source_dir, "python")
        
        print("Installing Python bindings...")
        subprocess.run([
            self.python_path, "setup.py", "install"
        ], cwd=python_dir, check=True)
    
    def _get_brew_prefix(self):
        """Get Homebrew prefix on macOS."""
        try:
            result = subprocess.run(
                ["brew", "--prefix"], 
                capture_output=True, 
                text=True, 
                check=True
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None
    
    def verify_installation(self):
        """Verify that liblouis is properly installed."""
        try:
            result = subprocess.run([
                self.python_path, "-c", 
                "import louis; print(louis.version())"
            ], capture_output=True, text=True, check=True)
            
            version = result.stdout.strip()
            print(f"✅ liblouis {version} installed successfully!")
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"❌ Installation verification failed: {e}")
            return False
    
    def install(self):
        """Main installation method."""
        print(f"Installing liblouis {self.version} for {self.system}...")
        
        # Check prerequisites
        self.check_prerequisites()
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download and extract source
            source_dir = self.download_source(temp_dir)
            
            # Build library
            self.build_liblouis(source_dir)
            
            # Install Python bindings
            self.install_python_bindings(source_dir)
        
        # Verify installation
        return self.verify_installation()


def main():
    parser = argparse.ArgumentParser(description="Install liblouis from source")
    parser.add_argument("--version", default="3.34.0", help="liblouis version to install")
    parser.add_argument("--python-path", help="Path to Python interpreter")
    
    args = parser.parse_args()
    
    installer = LibLouisInstaller(
        version=args.version,
        python_path=args.python_path
    )
    
    try:
        success = installer.install()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"Installation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
