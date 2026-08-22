// DELVE — voxel models.
//
// Everything in the dungeon used to be three or four big boxes: a body, a head,
// a stick for a blade. That reads as programmer art, and at 46x23 pixels a tile
// there is easily room for better. A model here is a stack of LAYERS, each a
// small grid, and it is drawn as many little cubes with a light on it — which
// is what makes a voxel thing look sculpted rather than assembled.
//
// Layers run from the ground up. Within a layer, rows are y and columns are x,
// in grid space — so the bottom of the screen is +x and +y, and the face of a
// creature is drawn toward the lower rows and columns, where the camera is.
//
//   .  nothing
//   others index into that model's own palette
//
// Every model is authored on a 6x6 footprint and scaled to whatever fraction of
// a tile it should occupy, so one number changes how big everything reads.

export const MODELS = {
  // The delver: hood, cloak, a blade held out to the right. The face is a dark
  // notch under the hood rather than a drawn face — at this size a face is two
  // pixels and reads as noise, but a shadow reads as a hood.
  player: {
    pal: { c: '#4d84ab', C: '#3a6a8c', d: '#2c4f6b', s: '#f0dfc0', k: '#171c22', m: '#e6ecf3', g: '#c9a227' },
    scale: 1.0,
    layers: [
      ['......', '.kk.k.', '.kk.k.', '......', '......', '......'],
      ['.dddd.', '.dddd.', '.dddd.', '.dd...', '......', '......'],
      ['.cccc.', 'cccccc', 'cccccc', '.cccc.', '....m.', '......'],
      ['.cccc.', 'cCcccc', 'cccccc', '.cccc.', '....m.', '......'],
      ['.cccc.', 'cCcccc', 'cccccc', '.cccc.', '....m.', '......'],
      ['..gg..', '.gccg.', '.cccc.', '..cc..', '....m.', '......'],
      ['..cc..', '.cssc.', '.cssc.', '..kk..', '....m.', '......'],
      ['......', '..cc..', '.cccc.', '..cc..', '....m.', '......'],
      ['......', '......', '..cc..', '......', '....m.', '......'],
    ],
  },

  // A shambler. Lopsided on purpose: one shoulder higher, the head sunk into
  // it, so the silhouette says "wrong" before you have read anything else.
  husk: {
    pal: { a: '#9dbb72', b: '#7f9a58', c: '#5e7440', e: '#20240f', f: '#c8dc9a' },
    scale: 0.96,
    layers: [
      ['......', '..cc..', '.cc.c.', '..c...', '......', '......'],
      ['..bbb.', '.bbbb.', '.bbbb.', '..bb..', '......', '......'],
      ['.aaab.', 'aaaaab', '.aaaab', '..aab.', '......', '......'],
      ['.aaab.', 'aaaaab', 'aaaaab', '..aab.', '......', '......'],
      ['..aab.', '.aaaab', '.aaaab', '...ab.', '......', '......'],
      ['..bb..', '.beeb.', '.bffb.', '..bb..', '......', '......'],
      ['......', '..bb..', '..bb..', '......', '......', '......'],
    ],
  },

  // Squat and wide, with a lit throat. It never moves much, so its whole job is
  // to be visible from across the room and to look like it is aiming.
  spitter: {
    pal: { p: '#c977b4', q: '#a45a92', r: '#6d3a5f', o: '#ffb347', y: '#fff0c4' },
    scale: 1.04,
    layers: [
      ['.rrrr.', 'rrrrrr', 'rrrrrr', 'rrrrrr', '.rrrr.', '......'],
      ['.qqqq.', 'qqqqqq', 'qqqqqq', 'qqqqqq', '.qqqq.', '......'],
      ['..pp..', '.pppp.', 'pp..pp', '.pppp.', '..pp..', '......'],
      ['......', '..pp..', '.p..p.', '..pp..', '......', '......'],
      ['......', '..oo..', '.oyyo.', '..oo..', '......', '......'],
      ['......', '......', '..yy..', '......', '......', '......'],
    ],
  },

  // The heavy. Broad shoulders, a crown of plate, and one long arm — the arm is
  // the tell, because the arm is the three tiles it sweeps.
  sentinel: {
    pal: { s: '#7f8b9e', t: '#5d6879', u: '#3d4652', v: '#dfe6ee', w: '#242a33' },
    scale: 1.12,
    layers: [
      ['.uuuu.', 'uuuuuu', 'uuuuuu', 'uuuuuu', '.uuuu.', '......'],
      ['.tttt.', 'tttttt', 'tttttt', 'tttttt', '.tttt.', '......'],
      ['.ssss.', 'ssssss', 'ssssss', 'ssssss', '.ssss.', '......'],
      ['ssssss', 'ssssss', 'ssssss', 'ssssss', 'ssssss', '.tttt.'],
      ['.tsst.', 'ssssss', 'ssssss', 'ssssss', '.tsst.', '.tttt.'],
      ['..ss..', '.swws.', '.swws.', '..ss..', '......', '......'],
      ['..vv..', '.vssv.', '.vssv.', '..vv..', '......', '......'],
      ['......', '..vv..', '..vv..', '......', '......', '......'],
    ],
  },
};

// Props share one palette slot 'x' that the caller recolours, so a relic can be
// any tier colour and a stair can be any door colour without a model each.
export const PROPS = {
  // a faceted stone on a low plinth
  relic: {
    pal: { p: '#2f2822', q: '#443a30' },
    scale: 1.0,
    layers: [
      ['.pppp.', 'pppppp', 'pppppp', 'pppppp', '.pppp.', '......'],
      ['..qq..', '.qqqq.', '.qqqq.', '..qq..', '......', '......'],
      ['......', '..xx..', '..xx..', '......', '......', '......'],
      ['......', '.xxxx.', '.xxxx.', '......', '......', '......'],
      ['......', '.xXXx.', '.xXXx.', '......', '......', '......'],
      ['......', '..XX..', '..XX..', '......', '......', '......'],
      ['......', '...X..', '......', '......', '......', '......'],
    ],
  },
  // a dressed column, chipped
  pillar: {
    pal: { a: '#8b8173', b: '#756b5d', c: '#9d9384', d: '#5f5649' },
    moss: '#8d9a6b', mossy: 11,
    scale: 1.0,
    layers: [
      ['cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc'],
      ['.bbbb.', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbb.', '.bbbb.'],
      ['.aaaa.', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaa.', '.aaaa.'],
      ['.aaaa.', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', '.aaaa.'],
      ['.aaaa.', 'aadaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', '.aaaa.'],
      ['.bbbb.', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', '.bbbb.'],
      ['cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc'],
      ['.cccc.', 'cccccc', 'cccccc', 'cccccc', 'cccccc', '.cccc.'],
    ],
  },
  // A brazier: a stone bowl on a stem with fire in it. These are the only
  // things in the dungeon that light it, so they are placed on walls where they
  // can throw a pool across the floor.
  brazier: {
    pal: { s: '#5c5346', t: '#433c33', o: '#ff8a2b', y: '#ffd166', w: '#fff3c4' },
    scale: 0.86,
    layers: [
      ['..tt..', '.tttt.', '.tttt.', '..tt..', '......', '......'],
      ['..ss..', '..ss..', '..ss..', '..ss..', '......', '......'],
      ['..ss..', '..ss..', '..ss..', '..ss..', '......', '......'],
      ['.ssss.', 'ssssss', 'ssssss', '.ssss.', '......', '......'],
      ['.tttt.', 't.oo.t', 't.oo.t', '.tttt.', '......', '......'],
      ['......', '..oo..', '.oyyo.', '..oo..', '......', '......'],
      ['......', '..yy..', '.ywwy.', '..yy..', '......', '......'],
      ['......', '......', '..ww..', '......', '......', '......'],
    ],
  },

  // a heap of broken stone
  rubble: {
    pal: { a: '#b0a595', b: '#8f8578', c: '#6e675c' },
    moss: '#8a9668', mossy: 22,
    scale: 1.0,
    layers: [
      ['.bbbb.', 'baaabb', 'baaaab', 'bbaaab', '.bbbb.', '......'],
      ['..ab..', '.aab..', '.aaab.', '..bb..', '......', '......'],
      ['......', '..a...', '..aa..', '......', '......', '......'],
    ],
  },
};
