# Put your photos here

Drop image files straight into this folder — `.jpg`, `.jpeg`, `.png`, `.webp`,
`.avif`, `.gif` or `.svg`. Subfolders are not scanned; keep everything flat.

Then regenerate the playlist:

```
node tools/build-manifest.mjs
```

While this folder is empty, the player falls back to the placeholder images in
`samples/` so there is always something on screen.

Any mix of sizes and aspect ratios is fine — that's what the layout is built
for. Nothing gets cropped and nothing gets black bars.

This README is ignored by the scanner; it's here so the folder survives in git.
