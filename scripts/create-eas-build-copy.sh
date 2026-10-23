#!/usr/bin/env bash
set -u

SOURCE="${1:-}"
OUT="${2:-}"

if [[ -z "$SOURCE" || -z "$OUT" ]]; then
  echo "Uso: bash scripts/create-eas-build-copy.sh /ruta/TragosSociales /ruta/TragosSociales-EAS" >&2
  exit 2
fi

SOURCE="$(readlink -f "$SOURCE")"
OUT="$(readlink -m "$OUT")"

if [[ ! -f "$SOURCE/package.json" || ! -d "$SOURCE/android" ]]; then
  echo "Error: el origen debe contener package.json y android/: $SOURCE" >&2
  exit 1
fi

if [[ "$SOURCE" == "$OUT" || "$OUT" == "$SOURCE"/* ]]; then
  echo "Error: el destino no puede estar dentro del origen: $OUT" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

tar -C "$SOURCE" \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.expo' \
  --exclude='./.manus-logs' \
  --exclude='./updates' \
  --exclude='./apks' \
  --exclude='./*.zip' \
  --exclude='./*.apk' \
  --exclude='./*.aab' \
  --exclude='./*.log' \
  --exclude='./android/.gradle' \
  --exclude='./android/build' \
  --exclude='./android/app/build' \
  -cf - . | tar -C "$OUT" -xf -

printf 'Contexto EAS listo: %s\n' "$OUT"
du -sh "$OUT"
