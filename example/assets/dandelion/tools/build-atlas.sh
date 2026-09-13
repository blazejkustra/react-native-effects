#!/bin/sh
# Builds dandelion-atlas.jpg from the source photo. Needs ImageMagick 7 and Xcode
# (Vision, for the foreground mask). Run from this directory with the photo as $1:
#
#   curl -A 'rn-effects-example/1.0' -o source.jpg "<thumb.wikimedia.org url from the Commons API, iiurlwidth=2000>"
#   sh build-atlas.sh source.jpg
#
# Photo: "Taraxacum seedhead Paslieres 2013-05-09 n01.jpg", Marie-Lan Nguyen,
# CC BY 2.5, https://commons.wikimedia.org/wiki/File:Taraxacum_seedhead_Paslieres_2013-05-09_n01.jpg
#
# Output is one image, three panels of PW x PH side by side:
#   left    the photo, scaled to PW wide and extended upward with smeared bokeh so
#           the seeds have sky to fly into on a phone-shaped canvas
#   middle  the same with the seed head painted out (normalised-convolution fill of
#           the surrounding bokeh), stem kept, a small receptacle knob at the centre
#   right   data: R = soft head mask, G = hair matte (white pappus pixels), B = 0
set -eu
SRC=${1:?source photo}
PW=1000; PH=2174
CX=503; CY=1321; R=395          # head centre + radius on the canvas, px (measured from the mask)
STEM_X0=455; STEM_X1=545        # stem column on the canvas
T=$(mktemp -d)

# 1. Scale, then extend upward: the photo is 3:4 and the canvas is phone-shaped.
#    The extension is the photo's top rows stretched into vertical streaks (more
#    out-of-focus grass), and the photo's first FADE rows cross-fade into it so
#    the join has no line. The head starts ~110 rows in, so FADE stays under that.
FADE=90
magick "$SRC" -resize ${PW}x "$T/photo.png"
PHOTO_H=$(identify -format %h "$T/photo.png")
EXT=$((PH - PHOTO_H))
magick "$T/photo.png" -crop ${PW}x12+0+0 +repage -resize ${PW}x$((EXT + FADE))! -blur 0x20 "$T/ext.png"
magick -size ${PW}x${FADE} gradient:black-white "$T/fade.png"
magick "$T/photo.png" -crop ${PW}x${FADE}+0+0 +repage "$T/fade.png" -alpha off -compose CopyOpacity -composite "$T/photo_top_a.png"
magick "$T/ext.png" "$T/photo_top_a.png" -geometry +0+${EXT} -compose Over -composite "$T/ext.png"
magick "$T/photo.png" -crop ${PW}x$((PHOTO_H - FADE))+0+${FADE} +repage "$T/photo_rest.png"
magick "$T/ext.png" "$T/photo_rest.png" -append +repage "$T/canvas.png"

# 2. Foreground mask (Vision), on the canvas.
[ -x ./liftmask ] || swiftc -O liftmask.swift -o liftmask
./liftmask "$T/photo.png" "$T/mask_photo.png"
magick -size ${PW}x${EXT} xc:black \( "$T/mask_photo.png" -colorspace gray \) -append +repage -depth 8 "$T/vision.png"

# 3. Head disc, stem, hair matte.
magick -size ${PW}x${PH} xc:black -fill white -draw "circle $CX,$CY $((CX + R)),$CY" -blur 0x6 "$T/disc.png"
magick -size ${PW}x${PH} xc:black -fill white -draw "rectangle $STEM_X0,$((CY + R * 86 / 100)) $STEM_X1,$PH" "$T/stemcol.png"
magick "$T/vision.png" "$T/stemcol.png" -compose Multiply -composite "$T/stem.png"
magick "$T/disc.png" "$T/vision.png" -compose Multiply -composite \
  \( "$T/stem.png" -negate \) -compose Multiply -composite "$T/head.png"
magick "$T/canvas.png" -colorspace HSL -channel G -separate +channel -negate -level 45%,85% "$T/satkey.png"
magick "$T/canvas.png" -colorspace gray -level 40%,80% "$T/lumkey.png"
magick "$T/satkey.png" "$T/lumkey.png" -compose Multiply -composite "$T/head.png" -compose Multiply -composite "$T/hair.png"

# 4. Bald panel: paint the head out. A push-pull inpaint — repeated normalised
#    convolutions, blur(img * known) / blur(known), each pass filling the pixels
#    the previous one reached — pulls the surrounding bokeh inward with its
#    gradient instead of averaging it into one flat disc. Then the stem is
#    extended up to the centre (it was hidden behind the seeds) and a small
#    receptacle knob, the photo's own centre gone pale, sits on top.
magick -size ${PW}x${PH} xc:black -fill white -draw "circle $CX,$CY $((CX + R + 22)),$CY" -blur 0x10 \
  \( "$T/stem.png" -negate \) -compose Multiply -composite -alpha off "$T/fill.png"
# Masks must be plain grayscale: a stray alpha channel turns Multiply into a blend.
magick "$T/fill.png" -negate -threshold 50% -alpha off "$T/known.png"
cp "$T/canvas.png" "$T/work.png"
for SIGMA in 6 10 16 26 40 64 100; do
  magick "$T/work.png" "$T/known.png" -compose Multiply -composite -blur 0x$SIGMA "$T/num.png"
  magick "$T/known.png" -blur 0x$SIGMA "$T/den.png"
  magick "$T/num.png" "$T/den.png" -compose Divide_Src -composite "$T/est.png"
  # Pixels the blur reached with some confidence become known this pass.
  magick "$T/den.png" -threshold 4% -alpha off "$T/reached.png"
  magick "$T/reached.png" \( "$T/known.png" -negate \) -compose Multiply -composite -alpha off "$T/newly.png"
  magick "$T/est.png" "$T/newly.png" -alpha off -compose CopyOpacity -composite "$T/est_a.png"
  magick "$T/work.png" "$T/est_a.png" -compose Over -composite "$T/work.png"
  magick "$T/known.png" "$T/newly.png" -compose Plus -composite -alpha off "$T/known.png"
done
magick "$T/work.png" -blur 0x3 "$T/fill.png" -alpha off -compose CopyOpacity -composite "$T/infill_a.png"
magick "$T/canvas.png" "$T/infill_a.png" -compose Over -composite "$T/bald.png"
# Stem up to the receptacle: the visible stem's top rows stretched upward,
# feathered at the sides so the strip blends into the fill.
STEM_TOP=$((CY + R * 86 / 100))
SEG_H=$((STEM_TOP - CY + 12))
magick "$T/canvas.png" -crop $((STEM_X1 - STEM_X0))x40+${STEM_X0}+${STEM_TOP} +repage -resize $((STEM_X1 - STEM_X0))x${SEG_H}! "$T/stemseg.png"
magick "$T/stem.png" -crop $((STEM_X1 - STEM_X0))x1+${STEM_X0}+$((STEM_TOP + 20)) +repage -blur 0x3 -resize $((STEM_X1 - STEM_X0))x${SEG_H}! "$T/stemseg_m.png"
magick "$T/stemseg.png" "$T/stemseg_m.png" -alpha off -compose CopyOpacity -composite "$T/stemseg_a.png"
magick "$T/bald.png" "$T/stemseg_a.png" -geometry +${STEM_X0}+$((CY - 12)) -compose Over -composite "$T/bald.png"
KR=$((R / 7))
magick -size ${PW}x${PH} xc:black -fill white -draw "circle $CX,$CY $((CX + KR)),$CY" -blur 0x3 "$T/knobmask.png"
magick "$T/canvas.png" -modulate 112,38,100 "$T/knobmask.png" -alpha off -compose CopyOpacity -composite "$T/knob_a.png"
magick "$T/bald.png" "$T/knob_a.png" -compose Over -composite "$T/bald.png"

# 5. Data panel and atlas.
magick "$T/head.png" "$T/hair.png" -size ${PW}x${PH} xc:black -channel RGB -combine "$T/data.png"
magick "$T/canvas.png" "$T/bald.png" "$T/data.png" +append -sampling-factor 1x1 -quality 90 ../dandelion-atlas.jpg
cp "$T/canvas.png" "$T/bald.png" "$T/data.png" "${ATLAS_DEBUG_DIR:-$T}/" 2>/dev/null || true
identify ../dandelion-atlas.jpg
ls -la ../dandelion-atlas.jpg
