"""MagicaVoxel .vox reader + a dimetric renderer that matches DELVE's projection."""
import struct
from PIL import Image

DEFAULT_PALETTE = None

def read_vox(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'VOX ', 'not a vox file'
    models, pal = [], None
    def walk(off, end):
        nonlocal pal
        while off < end:
            cid = d[off:off+4].decode('ascii', 'replace')
            n, m = struct.unpack('<II', d[off+4:off+12])
            body = d[off+12:off+12+n]
            if cid == 'SIZE':
                models.append({'size': struct.unpack('<III', body[:12]), 'vox': []})
            elif cid == 'XYZI':
                cnt = struct.unpack('<I', body[:4])[0]
                v = memoryview(body)[4:4+cnt*4]
                models[-1]['vox'] = [(v[i*4], v[i*4+1], v[i*4+2], v[i*4+3]) for i in range(cnt)]
            elif cid == 'RGBA':
                pal = [tuple(body[i*4:i*4+4]) for i in range(256)]
            if m: walk(off+12+n, off+12+n+m)
            off += 12 + n + m
    walk(8, len(d))
    # MagicaVoxel palette is 1-indexed and shifted by one
    if pal: pal = [(0,0,0,0)] + pal[:255]
    return models, pal

def shade(rgb, f):
    return tuple(max(0, min(255, int(c * f))) for c in rgb)

def render(model, pal, tw=8, th=4, zh=6, scale=1, key=True):
    """Dimetric render, same axes as DELVE: sx=(x-y)*tw, sy=(x+y)*th - z*zh."""
    sx, sy, sz = model['size']
    vox = model['vox']
    if not vox: return None
    W = (sx + sy) * tw + 4
    H = (sx + sy) * th + sz * zh + 8
    img = Image.new('RGBA', (W, H), (0,0,0,0))
    px = img.load()
    ox = sy * tw + 2
    oy = sz * zh + 4
    # painter's order: far to near
    for (x, y, z, ci) in sorted(vox, key=lambda v: (v[0] + v[1], v[2])):
        col = pal[ci] if pal and ci < len(pal) else (200,200,200,255)
        if col[3] == 0: continue
        base = col[:3]
        # key light along +z with a gentle gradient, like DELVE's paintModel
        f = 0.72 + 0.34 * (z / max(1, sz)) if key else 1.0
        top = shade(base, 1.0 * f)
        left = shade(base, 0.78 * f)
        right = shade(base, 0.62 * f)
        px0 = ox + (x - y) * tw
        py0 = oy + (x + y) * th - z * zh
        # top face (diamond)
        for dy in range(-th, th):
            span = int(tw * (1 - abs(dy) / th))
            for dx in range(-span, span):
                X, Y = px0 + dx, py0 + dy
                if 0 <= X < W and 0 <= Y < H: px[X, Y] = top + (255,)
        # left and right faces
        for dx in range(-tw, 0):
            hh = int(th * (1 - abs(dx) / tw))
            for dy in range(hh, hh + zh + 1):
                X, Y = px0 + dx, py0 + dy
                if 0 <= X < W and 0 <= Y < H: px[X, Y] = left + (255,)
        for dx in range(0, tw):
            hh = int(th * (1 - abs(dx) / tw))
            for dy in range(hh, hh + zh + 1):
                X, Y = px0 + dx, py0 + dy
                if 0 <= X < W and 0 <= Y < H: px[X, Y] = right + (255,)
    return img.crop(img.getbbox()) if img.getbbox() else None
