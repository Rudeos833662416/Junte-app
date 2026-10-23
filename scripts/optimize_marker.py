from pathlib import Path
from PIL import Image

path = Path('/home/ubuntu/copia-de-tragos-sociales/assets/images/beer-map-marker.png')
image = Image.open(path).convert('RGBA')
image.thumbnail((768, 768), Image.Resampling.LANCZOS)
image.save(path, format='PNG', optimize=True, compress_level=9)
print('saved', path, image.size, image.mode, path.stat().st_size)
