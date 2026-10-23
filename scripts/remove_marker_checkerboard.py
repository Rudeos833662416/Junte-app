from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

path = Path('/home/ubuntu/copia-de-tragos-sociales/assets/images/beer-map-marker.png')
image = Image.open(path).convert('RGBA')
arr = np.array(image)
rgb = arr[:, :, :3]
# El asset entregado trae un tablero gris claro en lugar de alfa. Solo se considera
# fondo el gris claro conectado con el borde; la espuma blanca queda protegida por el contorno negro.
background = (rgb.min(axis=2) > 225) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 16)
h, w = background.shape
seen = np.zeros((h, w), dtype=bool)
queue = deque()
for x in range(w):
    if background[0, x]: queue.append((0, x))
    if background[h - 1, x]: queue.append((h - 1, x))
for y in range(h):
    if background[y, 0]: queue.append((y, 0))
    if background[y, w - 1]: queue.append((y, w - 1))
while queue:
    y, x = queue.popleft()
    if seen[y, x] or not background[y, x]:
        continue
    seen[y, x] = True
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and background[ny, nx]:
            queue.append((ny, nx))
arr[seen, 3] = 0
Image.fromarray(arr, 'RGBA').save(path)
print('saved', path, 'mode=RGBA', 'removed_pixels=', int(seen.sum()))
