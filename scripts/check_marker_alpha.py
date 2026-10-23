from PIL import Image
from pathlib import Path
path = Path('/home/ubuntu/copia-de-tragos-sociales/assets/images/beer-map-marker.png')
image = Image.open(path)
print('mode=', image.mode)
print('size=', image.size)
print('corner=', image.getpixel((0, 0)))
if 'A' in image.getbands():
    alpha = image.getchannel('A')
    print('alpha_extrema=', alpha.getextrema())
