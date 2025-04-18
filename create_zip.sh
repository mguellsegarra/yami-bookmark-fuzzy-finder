#!/bin/bash

# Create build directory if it doesn't exist
mkdir -p build

# Get current datetime in the format YYYYMMDD_HHMMSS
DATETIME=$(date +"%Y%m%d_%H%M%S")
ZIP_NAME="build/yami_${DATETIME}.zip"

# Create zip file with necessary files
zip -r "$ZIP_NAME" \
    manifest.json \
    content.js \
    background.js \
    styles.css \
    fuse.min.js \
    icons/ \
    _locales/ \
    -x "*.DS_Store" \
    -x ".*" \
    -x "__MACOSX/*" \
    -x "build/*"

echo "Created extension package at: $ZIP_NAME"