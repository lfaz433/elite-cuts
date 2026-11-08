#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EMULATOR_PORT=8080
EMULATOR_LOG="$(mktemp -t elite-cuts-firestore-emulator.XXXXXX)"
EMULATOR_PID=""
EMULATOR_LISTENER_PID=""

cleanup() {
  if [[ -n "$EMULATOR_LISTENER_PID" ]]; then
    kill -KILL "$EMULATOR_LISTENER_PID" 2>/dev/null || true
  fi
  if [[ -n "$EMULATOR_PID" ]]; then
    kill -KILL "$EMULATOR_PID" 2>/dev/null || true
  fi
  rm -f "$EMULATOR_LOG"
}

trap cleanup EXIT INT TERM

if lsof -nP -t -iTCP:"$EMULATOR_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Firestore emulator port $EMULATOR_PORT is already in use. Stop that process before running the rules tests." >&2
  exit 1
fi

cd "$ROOT_DIR"
firebase emulators:start --only firestore --project launch >"$EMULATOR_LOG" 2>&1 &
EMULATOR_PID=$!

for _ in {1..240}; do
  EMULATOR_LISTENER_PID="$(lsof -nP -t -iTCP:"$EMULATOR_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$EMULATOR_LISTENER_PID" ]]; then
    FIRESTORE_EMULATOR_HOST="127.0.0.1:$EMULATOR_PORT" \
      node ./node_modules/jest/bin/jest.js \
      --config ./rules-tests/jest.config.cjs \
      --runInBand \
      --forceExit
    exit $?
  fi
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    cat "$EMULATOR_LOG" >&2
    exit 1
  fi
  sleep 0.25
done

echo "Firestore emulator did not start within 60 seconds." >&2
cat "$EMULATOR_LOG" >&2
exit 1
