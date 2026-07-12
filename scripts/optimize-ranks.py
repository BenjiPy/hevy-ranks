"""Optimise (redimensionne) les emblèmes de rang dans assets/ranks/ sur place.

Usage : python scripts/optimize-ranks.py
Après avoir (re)généré des emblèmes dans assets/ranks/, ce script les ramène
à 256 px et les compresse pour rester léger sur GitHub Pages.
"""
import os
from PIL import Image

RANKS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "ranks"
)
SIZE = 256

total = 0
for n in sorted(os.listdir(RANKS)):
    if not n.lower().endswith(".png"):
        continue
    path = os.path.join(RANKS, n)
    img = Image.open(path).convert("RGBA")
    if max(img.size) > SIZE:
        img.thumbnail((SIZE, SIZE), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)
    kb = os.path.getsize(path) / 1024
    total += kb
    print(f"{n}: {img.size[0]}x{img.size[1]}  {kb:.0f} KB")
print(f"TOTAL: {total/1024:.2f} MB")
