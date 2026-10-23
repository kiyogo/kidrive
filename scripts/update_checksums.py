import hashlib
import os

assets_dir = 'release_assets'
sums = []
for f in sorted(os.listdir(assets_dir)):
    if f == 'SHA256SUMS.txt':
        continue
    filepath = os.path.join(assets_dir, f)
    if os.path.isfile(filepath):
        with open(filepath, 'rb') as fp:
            h = hashlib.sha256(fp.read()).hexdigest()
        sums.append(f"{h}  {f}\n")

with open(os.path.join(assets_dir, 'SHA256SUMS.txt'), 'w', encoding='utf-8') as out:
    out.writelines(sums)

print(f"Updated SHA256SUMS.txt with {len(sums)} files.")
