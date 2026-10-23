from pathlib import Path
from PIL import Image

assets_dir = Path('/home/ubuntu/socialsip/assets/images')
asset_names = [
    'icon.png',
    'splash-icon.png',
    'favicon.png',
    'android-icon-foreground.png',
]

source = Image.open(assets_dir / 'icon.png').convert('RGBA')
source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

for name in asset_names:
    output = source.copy()
    if name == 'favicon.png':
        output.thumbnail((512, 512), Image.Resampling.LANCZOS)
    output = output.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert('RGBA')
    output.save(assets_dir / name, format='PNG', optimize=True, compress_level=9)

print('Optimized:', ', '.join(asset_names))
for name in asset_names:
    path = assets_dir / name
    print(f'{name}: {path.stat().st_size} bytes')
