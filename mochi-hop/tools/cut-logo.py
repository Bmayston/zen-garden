import sys
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as ndi

src = Image.open(sys.argv[1]).convert('RGB')
a = np.asarray(src).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
lum = (r + g + b) / 3
H, W = r.shape

# background = blue sky, or light neutral/cool pixels (clouds, glow)
sky = (b - r) > 18
cloud = (lum > 190) & (b >= r - 3) & (np.abs(g - b) < 40)
removable = sky | cloud

# background is whatever removable region touches the border
lab, n = ndi.label(removable)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
keep = ~bg
# drop small leftover cloud islands: components that are mostly neutral-light
klab, kn = ndi.label(keep)
sizes = ndi.sum(np.ones_like(r), klab, range(1, kn + 1))
neutral_frac = ndi.mean(cloud.astype(np.float32), klab, range(1, kn + 1))
for i, (sz, nf) in enumerate(zip(sizes, neutral_frac), start=1):
    if nf > 0.5 or sz < 150:
        keep[klab == i] = False
keep = ndi.binary_fill_holes(keep)

# fade out the dirt island under the grass
yy = np.arange(H)[:, None] * np.ones((1, W))
fade = np.clip(1 - (yy - 1040) / 40, 0, 1)
brown = (r > g + 25) & (g > b) & (yy > 1000)
alpha = keep.astype(np.float32) * np.where(brown, 0, 1) * np.where(yy > 1080, 0, 1) * np.maximum(fade, (yy < 1040))
alpha = ndi.gaussian_filter(alpha, 1.0)
alpha = np.where(alpha > 0.97, 1, alpha)

# de-spill: remove blue tint on soft edges
edge = (alpha > 0.01) & (alpha < 0.99)
out = a.copy()
out[..., 2] = np.where(edge, np.minimum(b, (r + g) / 2 + 8), b)
im = Image.fromarray(np.dstack([out, alpha * 255]).astype(np.uint8), 'RGBA')
bbox = im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox()
im = im.crop(bbox)
im.save(sys.argv[2])
print('size', im.size)
