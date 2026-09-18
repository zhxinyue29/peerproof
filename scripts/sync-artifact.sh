#!/usr/bin/env bash
# Copies EventDirectory's compiled bytecode and ABI into the frontend.
#
# The browser deploys this contract itself, so it needs the bytecode at hand. Checking in a
# generated file is a cost; the alternative was a keystore and a password on the deploy path, and
# that turned out to be the thing that actually stopped work.
#
# Run after any change to contracts/src/EventDirectory.sol.
set -euo pipefail
cd "$(dirname "$0")/.."

# forge is not on PATH in a non-login shell, and a silent build failure here would ship stale
# bytecode — which for a deploy button means deploying the wrong contract.
FORGE=${FORGE:-$(command -v forge || echo "$HOME/.foundry/bin/forge")}
[ -x "$FORGE" ] || { echo "forge not found; set FORGE=/path/to/forge" >&2; exit 1; }
(cd contracts && "$FORGE" build >/dev/null)

python3 - <<'PY'
import json, pathlib
src = pathlib.Path("contracts/out/EventDirectory.sol/EventDirectory.json")
d = json.loads(src.read_text())
bc = d["bytecode"]["object"]
abi = d["abi"]
out = pathlib.Path("web/lib/directoryArtifact.ts")
out.write_text(
    "// Generated from contracts/out/EventDirectory.sol/EventDirectory.json — do not edit by hand.\n"
    "//\n"
    "// Checked in so the browser can deploy the directory without a keystore: the wallet already\n"
    "// holds the key, so a click replaces a password prompt. Regenerate with scripts/sync-artifact.sh\n"
    "// after any change to EventDirectory.sol.\n"
    'import type { Hex } from "viem";\n\n'
    f'export const eventDirectoryBytecode = "{bc}" as Hex;\n\n'
    "export const eventDirectoryAbi = " + json.dumps(abi, indent=2) + " as const;\n"
)
print(f"wrote {out} ({len(bc)//2 - 1} bytes of bytecode)")
PY
