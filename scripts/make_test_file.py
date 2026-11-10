"""Generate deterministic 5 MiB binary fixture."""
from hashlib import sha256
from pathlib import Path
size = 5 * 1024 * 1024
block = bytes(range(256)) * 4096
path = Path("data/samples/test-5mb.bin")
path.parent.mkdir(parents=True, exist_ok=True)
with path.open("wb") as output:
    remaining = size
    while remaining:
        chunk = block[:min(remaining, len(block))]
        output.write(chunk)
        remaining -= len(chunk)
print(f"{path}: {path.stat().st_size} bytes; sha256={sha256(path.read_bytes()).hexdigest()}")
