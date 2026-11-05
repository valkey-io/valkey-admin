#!/usr/bin/env bash
# Regenerates the decompression test fixtures with the reference implementations.
# Needs: gzip, zstd and lz4 CLIs; python3 (or $PYTHON) with the `lz4` and `python-snappy` packages;
# node; and a Valkey server on localhost:6379 for the GLIDE fixtures (it writes and deletes one temporary key).
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PYTHON="${PYTHON:-python3}"
FIXTURES_DIR="$PWD"

"$PYTHON" - <<'EOF'
import json
sample = {"user": {"id": 1, "name": "Ada Lovelace", "tags": ["math", "engines"] * 20}, "events": [
    {"seq": i, "type": "login" if i % 3 else "logout", "note": "café ✓"} for i in range(60)]}
open("sample.json", "w", encoding="utf-8").write(json.dumps(sample))
# About 140 KiB of text, so LZ4 frames span several 64 KiB blocks and Snappy streams span several chunks.
open("large.txt", "w").write("".join(f"{i:06d} GET /api/items/{i % 97} 200 {i * 7 % 1000}ms\n" for i in range(4000)))
# Compressible bytes that aren't valid UTF-8, for the hex view.
open("binary.bin", "wb").write(bytes([0xff, 0xfe, 0x00, 0x80] * 256))
EOF

gzip -9 -n -c sample.json > sample.json.gz
gzip -9 -n -c large.txt > large.txt.gz
gzip -9 -n -c binary.bin > binary.bin.gz
zstd -19 -q -f sample.json -o sample.json.zst
lz4 -9 -q -f sample.json sample.json.lz4
lz4 -9 -q -f -B4 -BD --content-size large.txt large.txt.linked.lz4
lz4 -9 -q -f -B4 -BI -BX large.txt large.txt.independent.lz4

"$PYTHON" - <<'EOF'
import zlib, lz4.block, snappy
data = open("sample.json", "rb").read()
large = open("large.txt", "rb").read()
open("sample.json.zlib", "wb").write(zlib.compress(data, 9))
open("sample.json.lz4block", "wb").write(lz4.block.compress(data, store_size=False))
open("sample.json.snappy", "wb").write(snappy.compress(data))
open("large.txt.sz", "wb").write(snappy.StreamCompressor().add_chunk(large))
EOF

# Decompression bombs: small inputs that expand far past any output limit.
head -c $((64 * 1024 * 1024)) /dev/zero | gzip -9 -n > bomb.gz
head -c $((1024 * 1024 * 1024)) /dev/zero | zstd -19 -q > bomb.zst

(cd "$REPO_ROOT" && FIXTURES_DIR="$FIXTURES_DIR" node --input-type=module) <<'EOF'
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
const require = createRequire(`${process.cwd()}/`)
const { GlideClient, CompressionBackend, Decoder } = require("@valkey/valkey-glide")
const dir = process.env.FIXTURES_DIR
const data = readFileSync(`${dir}/sample.json`)
const plain = await GlideClient.createClient({ addresses: [{ host: "localhost", port: 6379 }] })
for (const [name, backend] of [["zstd", CompressionBackend.ZSTD], ["lz4", CompressionBackend.LZ4]]) {
  const key = `valkey-admin:fixture:glide-${name}`
  const compressing = await GlideClient.createClient({
    addresses: [{ host: "localhost", port: 6379 }], compression: { enabled: true, backend },
  })
  await compressing.set(key, data)
  writeFileSync(`${dir}/sample.json.glide-${name}`, await plain.get(key, { decoder: Decoder.Bytes }))
  await plain.del([key])
  compressing.close()
}
plain.close()
EOF

# Tests compare against large.txt.gz, so the large input itself is not committed.
rm large.txt
