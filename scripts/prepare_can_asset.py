from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

path = Path('/home/ubuntu/copia-de-tragos-sociales/assets/images/bebe-conmigo-marker.png')
image = Image.open(path).convert('RGBA')
arr = np.array(image)
rgb = arr[:, :, :3]
background = (rgb.min(axis=2) > 225) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 18)
h, w = background.shape
seen = np.zeros((h, w), dtype=bool)
queue = deque()
for x in range(w):
    if background[0, x]: queue.append((0, x))
    if background[h - 1, x]: queue.append((h - 1, x))
for y in range(h):
    if background[y, 0]: queue.append((y, 0))
    if background[y, w - 1]: queue.append((h - 1, w - 1))
while queue:
    y, x = queue.popleft()
    if seen[y, x] or not background[y, x]:
        continue
    seen[y, x] = True
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and background[ny, nx]:
            queue.append((ny, nx))
arr[seen, 3] = 0
out = Image.fromarray(arr, 'RGBA')
out.thumbnail((768, 1152), Image.Resampling.LANCZOS)
out.save(path, format='PNG', optimize=True, compress_level=9)
print('saved', path, out.size, out.mode, path.stat().st_size, 'removed=', int(seen.sum()))
