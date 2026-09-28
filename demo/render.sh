#!/bin/sh
# Runs in the demo image: VHS records demo.tape into a video, and ffmpeg makes
# the GIF from it in two passes - the palette from every frame first, written
# to a file, then the frames again, drawn in it. VHS makes a GIF in one pass,
# which holds every frame in memory until the palette is known: gigabytes for
# a minute of terminal.
set -eu

cd /codicitas

# demo.tape writes the video here, by its Output
VIDEO=/tmp/demo.mp4

vhs demo/demo.tape

# the video's frames differ a little even where nothing changed, so the ones
# that don't show a change are dropped, each one before held on screen for
# as long; undithered, a still terminal stays still, and the GIF only stores
# what changed
ffmpeg -loglevel error -y -i "$VIDEO" -vf mpdecimate,palettegen /tmp/palette.png
ffmpeg -loglevel error -y -i "$VIDEO" -i /tmp/palette.png \
    -lavfi '[0]mpdecimate[still];[still][1]paletteuse=dither=none:diff_mode=rectangle' \
    -fps_mode vfr demo/demo.gif
