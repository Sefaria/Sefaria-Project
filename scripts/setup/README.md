# LibLouis Installation

This directory contains scripts to install liblouis from source for cross-platform compatibility.

## Overview

LibLouis is an open-source braille translator and back-translator. Since it doesn't ship as a pip-installable package, we need to build it from source.

## Installation Methods

### Option 1: Automatic Installation (Recommended)

The code will automatically install liblouis when needed:

```python
from sefaria.liblouis_check import ensure_liblouis_installed
ensure_liblouis_installed(auto_install=True)
```

### Option 2: Manual Installation

#### macOS/Linux
```bash
./scripts/setup/install_liblouis.sh
```

#### Windows
```cmd
scripts\setup\install_liblouis.bat
```

#### Cross-platform Python
```bash
python scripts/setup/install_liblouis.py
```

## Prerequisites

- Python 3.7+
- GCC compiler
- Make utility
- Internet connection (for downloading source)

### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Or install via Homebrew
brew install gcc make
```

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install build-essential
```

### Windows
Install Visual Studio Build Tools or MinGW-w64.

## Verification

Test the installation:

```bash
python -c "import louis; print(louis.version())"
```

Or use the test script:

```bash
python scripts/setup/install_liblouis.py --test
```

## Troubleshooting

### Common Issues

1. **"gcc not found"**
   - Install build tools for your platform
   - On macOS: `xcode-select --install`
   - On Ubuntu: `sudo apt-get install build-essential`

2. **"make not found"**
   - Install make utility
   - On Ubuntu: `sudo apt-get install make`

3. **Permission errors**
   - Ensure you have write permissions to your Python environment
   - Consider using a virtual environment

4. **Import errors after installation**
   - Restart your Python interpreter
   - Check that the installation completed successfully

### Getting Help

Run the installation with verbose output:

```bash
python scripts/setup/install_liblouis.py --verbose
```

## Production Deployment

For production environments, liblouis is automatically installed during the Docker build process. The Dockerfile includes:

```dockerfile
# Install build tools and liblouis
RUN apt-get update && apt-get install -y gcc make
COPY scripts/setup/install_liblouis.py /app/scripts/setup/
RUN python3 /app/scripts/setup/install_liblouis.py
```

## Version Management

To install a specific version:

```bash
python scripts/setup/install_liblouis.py --version 3.34.0
```

Current supported version: 3.34.0
