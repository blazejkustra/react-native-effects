#!/usr/bin/env python3
"""Interior profile of the glass, measured off the source photo.

Prints ImageMagick -draw polygon strings (in canvas px) for the upper bulb,
the lower bulb, the neck, the two sand regions to paint out, and a JSON dump
of the wall table for the physics hook. Usage: profile.py <what> <top-pad>
"""
import json
import sys

# (photo y, OUTER half-width) of the glass, top to bottom. Interior = outer - GLASS.
UPPER = [(275, 90), (330, 185), (380, 208), (430, 218), (510, 222), (600, 212),
         (680, 185), (780, 135), (880, 82), (940, 45), (960, 24)]
LOWER = [(985, 24), (1020, 55), (1100, 100), (1200, 155), (1300, 195),
         (1400, 218), (1460, 222), (1540, 212), (1600, 185), (1635, 105), (1642, 80)]
NECK_Y = (955, 990)
NECK_W = 16
GLASS = 7
CX = 487
# Sand in the photo: the upper cone's surface (centre higher than the edges)
# and the lower pile's apex, photo y.
UPPER_SAND_TOP = [(265, 632), (330, 606), (400, 588), (487, 578), (570, 572), (640, 585), (705, 618)]
LOWER_PILE = {'apex': (487, 1348), 'base_y': 1500}


def interp(table, y):
    for (y0, w0), (y1, w1) in zip(table, table[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            return w0 + (w1 - w0) * t
    return table[0][1] if y < table[0][0] else table[-1][1]


def outline(table, pad, inset=GLASS, step=6):
    ys = list(range(table[0][0], table[-1][0] + 1, step)) + [table[-1][0]]
    right = [(CX + interp(table, y) - inset, y + pad) for y in ys]
    left = [(CX - interp(table, y) + inset, y + pad) for y in reversed(ys)]
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in right + left)


def sand_upper(pad):
    # Between the sand's top edge and the neck, inside the walls, with margin.
    ys = list(range(600, 961, 6))
    right = [(CX + interp(UPPER, y) - GLASS + 4, y + pad) for y in ys]
    left = [(CX - interp(UPPER, y) + GLASS - 4, y + pad) for y in reversed(ys)]
    top = []
    for x, y in UPPER_SAND_TOP:
        top.append((x, y - 10 + pad))
    pts = top + right + [(CX + 40, 990 + pad), (CX - 40, 990 + pad)] + left
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)


def sand_lower(pad):
    ax, ay = LOWER_PILE['apex']
    by = LOWER_PILE['base_y']
    ys = list(range(by - 40, 1643, 6))
    right = [(CX + interp(LOWER, y) - GLASS + 4, y + pad) for y in ys]
    left = [(CX - interp(LOWER, y) + GLASS - 4, y + pad) for y in reversed(ys)]
    pts = [(ax - 28, ay - 6 + pad), (ax + 28, ay - 6 + pad),
           (CX + interp(LOWER, by - 40) - GLASS + 4, by - 40 + pad)] + right + left + \
          [(CX - interp(LOWER, by - 40) + GLASS - 4, by - 40 + pad)]
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)


what = sys.argv[1]
pad = int(sys.argv[2]) if len(sys.argv) > 2 else 0
if what == 'upper':
    print(outline(UPPER, pad))
elif what == 'lower':
    print(outline(LOWER, pad))
elif what == 'neck':
    y0, y1 = NECK_Y
    print(f'{CX - NECK_W},{y0 + pad} {CX + NECK_W},{y0 + pad} {CX + NECK_W},{y1 + pad} {CX - NECK_W},{y1 + pad}')
elif what == 'sand-upper':
    print(sand_upper(pad))
elif what == 'sand-lower':
    print(sand_lower(pad))
elif what == 'table':
    # Wall table for the hook: interior half-width every 10 px, canvas y.
    rows = []
    for y in range(275, 1643, 10):
        tbl = UPPER if y <= 960 else LOWER
        w = interp(tbl, y) - GLASS
        if 955 <= y <= 990:
            w = min(w, NECK_W)
        rows.append([y + pad, round(max(w, NECK_W), 1)])
    print(json.dumps({'cx': CX, 'neckY': 972 + pad, 'neckW': NECK_W,
                      'upperTop': 278 + pad, 'lowerBottom': 1638 + pad,
                      'sandTopY': 600 + pad, 'rows': rows}))
