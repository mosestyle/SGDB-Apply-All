#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT}/package.json').version" 2>/dev/null || node -e "import('${ROOT}/package.json',{with:{type:'json'}}).then(x=>console.log(x.default.version))")"
NAME="SGDB Apply All"
STAGE="${ROOT}/out/${NAME}"
ZIP="${ROOT}/out/SGDB-Apply-All-v${VERSION}.zip"

if [[ ! -f "${ROOT}/dist/index.js" ]]; then
  echo "dist/index.js is missing. Run: pnpm run build" >&2
  exit 1
fi

rm -rf "${ROOT}/out"
mkdir -p "${STAGE}/dist"
cp "${ROOT}/dist/index.js" "${STAGE}/dist/index.js"
cp "${ROOT}/package.json" "${STAGE}/package.json"
cp "${ROOT}/plugin.json" "${STAGE}/plugin.json"
cp "${ROOT}/main.py" "${STAGE}/main.py"
cp "${ROOT}/README.md" "${STAGE}/README.md"
cp "${ROOT}/LICENSE" "${STAGE}/LICENSE"
cp "${ROOT}/THIRD_PARTY_NOTICES.md" "${STAGE}/THIRD_PARTY_NOTICES.md"

cd "${ROOT}/out"
zip -qr "${ZIP}" "${NAME}"
echo "Created ${ZIP}"
