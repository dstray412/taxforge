#!/usr/bin/env bash
# Builds dist/ and writes a self-contained artifact/index.html (CSS and JS inlined) for the
# claude.ai artifact viewer, which supplies its own doctype/html/head/body skeleton.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build >/dev/null
JS=$(ls dist/assets/*.js | head -1)
CSS=$(ls dist/assets/*.css | head -1)
mkdir -p artifact
{
  echo '<title>TaxForge</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo '<style>:root{color-scheme:dark}body{background:#0b0d10;color:#e6e8eb;margin:0}</style>'
  echo '<style>'; cat "$CSS"; echo '</style>'
  echo '<div id="root"></div>'
  echo '<script type="module">'; cat "$JS"; echo '</script>'
} > artifact/index.html
rm -rf artifact/assets
echo "artifact/index.html: $(wc -c < artifact/index.html) bytes (self-contained)"
