#!/bin/sh
# Builds hourglass-atlas.jpg from the source photo. Needs ImageMagick 7 and python3.
# Run from this directory with the photo as $1:
#
#   curl -A 'rn-effects-example/1.0' -o source.jpg \
#     "https://upload.wikimedia.org/wikipedia/commons/7/70/Wooden_hourglass_3.jpg"
#   sh build-atlas.sh source.jpg
#
# Photo: "Wooden hourglass 3.jpg", User:S Sepp, CC BY-SA 3.0,
# https://commons.wikimedia.org/wiki/File:Wooden_hourglass_3.jpg (967x1959).
#
# Output is one image, three panels of PW x PH side by side:
#   left    the photo with the sand painted OUT: both bulbs read as empty glass
#           (the rear post and the wall shading continue through where the sand
#           was), so the shader can put its own sand in at any level
#   middle  the photo as shot, padded to the canvas — the shader samples its
#           sand pile from here as the grain texture, so the rendered sand is
#           the photo's own sand
#   right   data: R = upper bulb interior, G = lower bulb interior (soft masks
#           of the glass INSIDE), B = distance to the nearest wall, 48 px = 1
#
# The canvas is the photo padded to a phone shape: PAD rows of white on top
# (the photo's top is pure white) and the last rows stretched at the bottom
# (the shadow under the base keeps going).
set -eu
SRC=${1:?source photo}
PW=967; PH=2102; PAD=100
T=$(mktemp -d)
P() { python3 profile.py "$@" "$PAD"; }

# 1. Canvas.
PHOTO_H=$(identify -format %h "$SRC")
BOT=$((PH - PAD - PHOTO_H))
magick -size ${PW}x${PAD} xc:white "$T/top.png"
magick "$SRC" -crop ${PW}x10+0+$((PHOTO_H - 10)) +repage -resize ${PW}x${BOT}! -blur 0x3 "$T/bot.png"
magick "$T/top.png" "$SRC" "$T/bot.png" -append +repage "$T/canvas.png"

# 2. Interior masks and the wall distance.
magick -size ${PW}x${PH} xc:black -fill white -draw "polygon $(P upper)" -blur 0x1.5 "$T/upper.png"
magick -size ${PW}x${PH} xc:black -fill white -draw "polygon $(P lower)" -blur 0x1.5 "$T/lower.png"
magick -size ${PW}x${PH} xc:black -fill white -draw "polygon $(P neck)" -blur 0x1 "$T/neck.png"
magick "$T/upper.png" "$T/lower.png" -compose Lighten -composite "$T/neck.png" -compose Lighten -composite "$T/inside.png"
# Distance to the wall, inside: 100 raw units per px, 48 px -> full scale.
magick "$T/inside.png" -threshold 50% -morphology Distance Euclidean:4,100 -depth 16 \
  -evaluate Multiply 0.01356 -depth 8 "$T/dist.png"

# 3. Empty-glass panel: paint the sand out.
#    a) The falling stream and the sand in the neck: a thin column, filled
#       sideways from the glass either side of it (a 1-D normalised convolution
#       so the wall shading is pulled across rather than averaged flat).
magick -size ${PW}x${PH} xc:black -fill white \
  -draw "roundrectangle $((487 - 20)),$((930 + PAD)) $((487 + 20)),$((1362 + PAD)) 10,10" -blur 0x2 "$T/streammask.png"
magick "$T/streammask.png" -negate -threshold 50% -alpha off "$T/known.png"
cp "$T/canvas.png" "$T/work.png"
for SIGMA in 6 14 30; do
  magick "$T/work.png" "$T/known.png" -compose Multiply -composite -morphology Convolve "Blur:0x${SIGMA},0" "$T/num.png"
  magick "$T/known.png" -morphology Convolve "Blur:0x${SIGMA},0" "$T/den.png"
  magick "$T/num.png" "$T/den.png" -compose Divide_Src -composite "$T/est.png"
  magick "$T/den.png" -threshold 4% -alpha off "$T/reached.png"
  magick "$T/reached.png" \( "$T/known.png" -negate \) -compose Multiply -composite -alpha off "$T/newly.png"
  magick "$T/est.png" "$T/newly.png" -alpha off -compose CopyOpacity -composite "$T/est_a.png"
  magick "$T/work.png" "$T/est_a.png" -compose Over -composite "$T/work.png"
  magick "$T/known.png" "$T/newly.png" -compose Plus -composite -alpha off "$T/known.png"
done
magick "$T/work.png" "$T/streammask.png" -alpha off -compose CopyOpacity -composite "$T/stream_a.png"
magick "$T/canvas.png" "$T/stream_a.png" -compose Over -composite "$T/empty.png"
#    b) The sand bodies: each is replaced by the strip of glass just above it,
#       stretched down over the whole region. Per column that continues the rear
#       post and the faint wall shading; a smear, but a smear of the right thing,
#       and most of it sits behind rendered sand anyway.
STRIP_Y=$((518 + PAD)); STRIP_H=28
magick "$T/empty.png" -crop ${PW}x${STRIP_H}+0+${STRIP_Y} +repage -resize ${PW}x$((1000 + PAD - STRIP_Y))! -blur 0x4 "$T/ustrip.png"
magick -size ${PW}x${PH} xc:black -fill white -draw "polygon $(P sand-upper)" -blur 0x3 "$T/usand.png"
magick "$T/empty.png" "$T/ustrip.png" -geometry +0+${STRIP_Y} -compose Over -composite "$T/usmear.png"
magick "$T/usmear.png" "$T/usand.png" -alpha off -compose CopyOpacity -composite "$T/usmear_a.png"
magick "$T/empty.png" "$T/usmear_a.png" -compose Over -composite "$T/empty.png"
STRIP_Y=$((1290 + PAD)); STRIP_H=40
magick "$T/empty.png" -crop ${PW}x${STRIP_H}+0+${STRIP_Y} +repage -resize ${PW}x$((1650 + PAD - STRIP_Y))! -blur 0x4 "$T/lstrip.png"
magick -size ${PW}x${PH} xc:black -fill white -draw "polygon $(P sand-lower)" -blur 0x3 "$T/lsand.png"
magick "$T/empty.png" "$T/lstrip.png" -geometry +0+${STRIP_Y} -compose Over -composite "$T/lsmear.png"
magick "$T/lsmear.png" "$T/lsand.png" -alpha off -compose CopyOpacity -composite "$T/lsmear_a.png"
magick "$T/empty.png" "$T/lsmear_a.png" -compose Over -composite "$T/empty.png"

# 4. Data panel and atlas.
magick "$T/upper.png" "$T/lower.png" "$T/dist.png" -channel RGB -combine "$T/data.png"
magick "$T/empty.png" "$T/canvas.png" "$T/data.png" +append -sampling-factor 1x1 -quality 88 ../hourglass-atlas.jpg
P table > ../wall-table.json
cp "$T/canvas.png" "$T/empty.png" "$T/data.png" "$T/inside.png" "${ATLAS_DEBUG_DIR:-$T}/" 2>/dev/null || true
identify ../hourglass-atlas.jpg
ls -la ../hourglass-atlas.jpg
