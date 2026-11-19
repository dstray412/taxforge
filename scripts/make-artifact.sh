#!/usr/bin/env bash
# Builds dist/ and writes artifact/index.html: a wrapper page (no doctype/html/head/body,
# the artifact viewer supplies those) that references the hashed Vite bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build >/dev/null
JS=$(ls dist/assets/*.js | head -1 | xargs basename)
CSS=$(ls dist/assets/*.css | head -1 | xargs basename)
mkdir -p artifact/assets
cp dist/assets/"$JS" dist/assets/"$CSS" artifact/assets/
cat > artifact/index.html <<HTML
<title>TaxForge</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="assets/$CSS">
<style>:root{color-scheme:dark}body{background:#0b0d10;color:#e6e8eb;margin:0}</style>
<div id="root"></div>
<script type="module" src="assets/$JS"></script>
HTML
echo "artifact/index.html -> assets/$JS, assets/$CSS"
