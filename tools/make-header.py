#!/usr/bin/env python3
"""Regenerate the watercolour header from the source photograph.

    python3 tools/make-header.py path/to/photo.jpg

Crop values below are tuned for the Wikimedia original of "Promontory Point
shoreline in Autumn" (2511x1200); change CROP if you swap the photo. See
CREDITS.md before replacing it — the licence travels with the picture.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from watercolor import render

CROP = (400, 60, 1800, 760)      # left, top, right, bottom — excludes Lake Shore Drive
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(HERE, 'budget', 'img')

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'source.jpg')
render(src, CROP, os.path.join(OUT, 'point-header.jpg'),    (1040, 520), quality=82)
render(src, CROP, os.path.join(OUT, 'point-header-sm.jpg'), (620, 310),  quality=80)
print('wrote point-header.jpg and point-header-sm.jpg')
