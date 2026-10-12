#!/usr/bin/env python3
"""Build Cadence brand assets from SVGs.

Generates:
- favicon.ico (containing 16x16 and 32x32)
- apple-touch-icon.png (180x180)
- og.png (1200x630: indigo background #4F46E5, mark, "Cadence", pitch "Plan the week. Ship one thing.")
"""
import os
import subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = ROOT / "design" / "brand"
MARK_SVG = BRAND_DIR / "cadence-mark.svg"

# 1. Render mark PNGs using rsvg-convert
subprocess.run([
    "/opt/homebrew/bin/rsvg-convert",
    "-w", "16", "-h", "16",
    str(MARK_SVG),
    "-o", str(BRAND_DIR / "mark-16.png")
], check=True)

subprocess.run([
    "/opt/homebrew/bin/rsvg-convert",
    "-w", "32", "-h", "32",
    str(MARK_SVG),
    "-o", str(BRAND_DIR / "mark-32.png")
], check=True)

subprocess.run([
    "/opt/homebrew/bin/rsvg-convert",
    "-w", "64", "-h", "64",
    str(MARK_SVG),
    "-o", str(BRAND_DIR / "mark-64.png")
], check=True)

subprocess.run([
    "/opt/homebrew/bin/rsvg-convert",
    "-w", "180", "-h", "180",
    str(MARK_SVG),
    "-o", str(BRAND_DIR / "apple-touch-icon.png")
], check=True)

subprocess.run([
    "/opt/homebrew/bin/rsvg-convert",
    "-w", "512", "-h", "512",
    str(MARK_SVG),
    "-o", str(BRAND_DIR / "mark-512.png")
], check=True)

# 2. Build favicon.ico with 16 and 32 sizes
img16 = Image.open(BRAND_DIR / "mark-16.png")
img32 = Image.open(BRAND_DIR / "mark-32.png")
img32.save(
    BRAND_DIR / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32)],
    append_images=[img16]
)

# 3. Create og.png via SVG and rsvg-convert (1200x630)
og_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <!-- Brand Indigo Background -->
  <rect width="1200" height="630" fill="#4F46E5"/>

  <!-- Centered container -->
  <g transform="translate(140, 195)">
    <!-- Brand Mark (240x240) -->
    <rect width="240" height="240" rx="52" fill="#4338CA" stroke="#6366F1" stroke-width="6"/>
    <!-- C arc -->
    <path d="M157.5 67.5C144.75 54 126 46.5 105 46.5C64.5 46.5 31.5 79.5 31.5 120C31.5 160.5 64.5 193.5 105 193.5C126 193.5 144.75 186 157.5 172.5" stroke="#FFFFFF" stroke-width="31.5" stroke-linecap="round"/>
    <circle cx="157.5" cy="120" r="24" fill="#FFFFFF"/>

    <!-- Text group -->
    <text x="300" y="105" fill="#FFFFFF" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="88" font-weight="800" letter-spacing="-0.03em">Cadence</text>
    <text x="300" y="175" fill="#E0E7FF" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="500" letter-spacing="-0.01em">Plan the week. Ship one thing.</text>
  </g>
</svg>"""

og_svg_path = BRAND_DIR / "og.svg"
og_svg_path.write_text(og_svg)

subprocess.run([
    "/opt/homebrew/bin/rsvg-convert",
    "-w", "1200", "-h", "630",
    str(og_svg_path),
    "-o", str(BRAND_DIR / "og.png")
], check=True)

print("Brand assets built successfully in", BRAND_DIR)
