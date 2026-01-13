#!/bin/bash
# Generate PNG icons from SVG
# Requires: ImageMagick (convert) or rsvg-convert

cd "$(dirname "$0")"

# Method 1: Using ImageMagick
if command -v convert &> /dev/null; then
    echo "Using ImageMagick..."
    convert -background transparent icon128.svg -resize 16x16 icon16.png
    convert -background transparent icon48.svg -resize 48x48 icon48.png
    convert -background transparent icon128.svg -resize 128x128 icon128.png
    echo "Icons generated successfully!"
    exit 0
fi

# Method 2: Using rsvg-convert (librsvg)
if command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert..."
    rsvg-convert -w 16 -h 16 icon16.svg > icon16.png
    rsvg-convert -w 48 -h 48 icon48.svg > icon48.png
    rsvg-convert -w 128 -h 128 icon128.svg > icon128.png
    echo "Icons generated successfully!"
    exit 0
fi

echo "Error: Neither ImageMagick nor rsvg-convert found."
echo "Please install one of them:"
echo "  macOS: brew install imagemagick"
echo "  Ubuntu: sudo apt install imagemagick"
echo ""
echo "Or create the PNG icons manually from SVG files"
exit 1
