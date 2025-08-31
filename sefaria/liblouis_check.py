"""
LibLouis installation checker and installer.

This module provides functions to check if liblouis is properly installed
and can automatically install it if needed.
"""

import os
import sys
import subprocess
import importlib.util
from pathlib import Path


def is_liblouis_installed():
    """
    Check if liblouis is properly installed and functional.
    
    Returns:
        tuple: (is_installed, version_or_error_message)
    """
    try:
        # Try to import louis
        import louis
        
        # Try to get version
        try:
            version = louis.version()
            return True, version
        except Exception as e:
            return False, f"liblouis imported but version check failed: {e}"
            
    except ImportError:
        return False, "liblouis module not found"
    except Exception as e:
        return False, f"Error checking liblouis: {e}"


def get_installation_script_path():
    """Get the path to the installation script."""
    # Get the sefaria module directory
    sefaria_dir = Path(__file__).parent
    project_root = sefaria_dir.parent
    script_path = project_root / "scripts" / "setup" / "install_liblouis.py"
    
    return script_path


def install_liblouis(python_path=None):
    """
    Install liblouis using the installation script.
    
    Args:
        python_path: Path to Python interpreter to use for installation
        
    Returns:
        bool: True if installation was successful
    """
    script_path = get_installation_script_path()
    
    if not script_path.exists():
        raise FileNotFoundError(
            f"Installation script not found at {script_path}. "
            "Please ensure the script is available in the repository."
        )
    
    # Build command
    cmd = [python_path or sys.executable, str(script_path)]
    
    print("Installing liblouis...")
    print(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True
        )
        print(result.stdout)
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"Installation failed with exit code {e.returncode}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False


def ensure_liblouis_installed(auto_install=True):
    """
    Ensure liblouis is installed, optionally installing it if not.
    
    Args:
        auto_install: If True, automatically install liblouis if not found
        
    Returns:
        bool: True if liblouis is available
        
    Raises:
        RuntimeError: If liblouis is not available and auto_install is False
    """
    is_installed, version_or_error = is_liblouis_installed()
    
    if is_installed:
        print(f"✅ liblouis {version_or_error} is available")
        return True
    
    print(f"❌ liblouis is not available: {version_or_error}")
    
    if not auto_install:
        raise RuntimeError(
            f"liblouis is required but not installed. Error: {version_or_error}\n"
            "Please run one of the following commands:\n"
            "  - scripts/setup/install_liblouis.sh (macOS/Linux)\n"
            "  - scripts/setup/install_liblouis.bat (Windows)\n"
            "  - python scripts/setup/install_liblouis.py"
        )
    
    print("Attempting to install liblouis automatically...")
    
    if install_liblouis():
        # Verify installation
        is_installed, version_or_error = is_liblouis_installed()
        if is_installed:
            print(f"✅ liblouis {version_or_error} installed successfully!")
            return True
        else:
            raise RuntimeError(f"Installation completed but verification failed: {version_or_error}")
    else:
        raise RuntimeError("Automatic installation failed. Please install manually.")


def test_liblouis_functionality():
    """
    Test basic liblouis functionality.
    
    Returns:
        bool: True if all tests pass
    """
    try:
        import louis
        
        # Test basic translation
        test_text = "Hello, world!"
        result = louis.translateString(['en-us-g2.ctb'], test_text)
        
        if result and len(result) > 0:
            print(f"✅ Basic translation test passed: '{test_text}' -> '{result}'")
            return True
        else:
            print("❌ Translation test failed: empty result")
            return False
            
    except Exception as e:
        print(f"❌ Functionality test failed: {e}")
        return False


if __name__ == "__main__":
    # Command line interface for testing
    import argparse
    
    parser = argparse.ArgumentParser(description="Check liblouis installation")
    parser.add_argument("--install", action="store_true", help="Install if not available")
    parser.add_argument("--test", action="store_true", help="Test functionality")
    
    args = parser.parse_args()
    
    if args.install:
        ensure_liblouis_installed(auto_install=True)
    elif args.test:
        if ensure_liblouis_installed(auto_install=False):
            test_liblouis_functionality()
    else:
        # Just check status
        is_installed, version_or_error = is_liblouis_installed()
        if is_installed:
            print(f"✅ liblouis {version_or_error} is available")
        else:
            print(f"❌ liblouis is not available: {version_or_error}")
