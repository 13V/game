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

// The creatures are drawn to MINECRAFT proportions, because that is the whole
// tell of the look: a head that is a big cube in its own right, a torso
// narrower than the head so the head OVERHANGS it, arms hanging clear at the
// shoulders, and two legs with daylight between them. The old models were
// 6-wide blobs with a small head sunk into the mass, which reads as a lump at
// any size, and did at 46 pixels a tile.
//
// They are 9 columns wide with a PINNED total height, so the silhouette is
// fixed and does not drift when `scale` changes. Width 9 splits as 1 arm,
// 5 torso, 2 arm on each side, so the shoulders read wider than the head —
// and the torso is shallower than the head, so the head overhangs the chest.
// That overhang is the whole Minecraft read.
//
// Layers run bottom-up: feet, legs, torso, head. What this camera SHOWS is the
// +x and +y faces, so anything meant to be read — an eye, a visor slit, a lit
// maw — sits on the far edge of those two axes and nowhere else. A detail at
// low x or low y is a detail nobody will ever see.

export const MODELS = {
  // The delver: boots, legs with light between them, a cloak flared behind,
  // a blade held clear on the +x side so it never merges into the body, and a
  // hood whose front is a dark notch. No drawn face — at five pixels a face is
  // noise, but a shadow under a brow reads as a hood every time.
  player: {
    pal: { c: '#5590ba', C: '#3f7599', d: '#2c4f6b', k: '#131920', m: '#eef3f9', g: '#d4aa2b' },
    scale: 1.00, height: 1.62,
    layers: [
      ['.........', '.........', '.........', '..kk.kk..', '..kk.kk..', '..kk.kk..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.ddddddd.', '.ddddddd.', '..dd.dd..', '..dd.dd..', '..dd.dd..', '........g', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '........m', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '........m', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '........m', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '........m', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '........m', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '........m', '.........', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCk..', '..CCCCC..', '..CCCCk..', '..CkCkC.m', '.........', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCk..', '..CCCCC..', '..CCCCk..', '..CkCkC..', '.........', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCC..', '..CCCCC..', '..CCCCC..', '..CCCCC..', '.........', '.........'],
      ['.........', '.........', '..ccccc..', '..ccccc..', '..ccccc..', '..ccccc..', '..ccccc..', '.........', '.........'],
    ],
  },

  // A shambler with its arms thrown forward and one shoulder riding a course
  // higher than the other. The silhouette says wrong before you have read the
  // colour, which is the only thing that works at this size.
  husk: {
    pal: { a: '#93b465', b: '#6d8c47', c: '#4e5a46', d: '#2b3226', e: '#12180d' },
    scale: 0.98, height: 1.54,
    layers: [
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..cc.cc..', '..cc.cc..', '..cc.cc..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..cc.cc..', '..cc.cc..', '..cc.cc..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..cc.cc..', '..cc.cc..', '..cc.cc..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..cc.cc..', '..cc.cc..', '..cc.cc..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..cc.cc..', '..cc.cc..', '..cc.cc..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', 'bbaaaaabb', 'bbaaaaabb', 'bbaaaaabb', '.........', '.........', '.........'],
      ['.........', '.........', '.........', 'bbaaaaabb', 'bbaaaaabb', 'bbaaaaabb', '.........', '.........', '.........'],
      ['.........', '.........', '.........', 'bbaaaaabb', 'bbaaaaabb', 'bbaaaaabb', '.........', '.........', '.........'],
      ['.........', '.........', '.........', 'bbaaaaabb', 'bbaaaaabb', 'bbaaaaabb', 'bb.....bb', 'bb.....bb', 'bb.....bb'],
      ['.........', '.........', '.........', 'bbaaaaabb', 'bbaaaaabb', 'bbaaaaabb', 'bb.....bb', 'bb.....bb', 'bb.....bb'],
      ['.........', '.........', '.........', 'bbaaaaabb', 'bbaaaaabb', 'bbaaaaabb', 'bb.....bb', 'bb.....bb', 'bb.....bb'],
      ['.........', '.........', '..aaaaa..', 'bbaaaae..', 'bbaaaaa..', 'bbaaaae..', '..aeaea..', '.........', '.........'],
      ['.........', '.........', '..aaaaa..', '..aaaae..', '..aaaaa..', '..aaaae..', '..aeaea..', '.........', '.........'],
      ['.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........'],
      ['.........', '.........', '..bbbbb..', '..bbbbb..', '..bbbbb..', '..bbbbb..', '..bbbbb..', '.........', '.........'],
    ],
  },

  // Squat and heavy, almost no legs, and a head that is mostly lit maw. It
  // never moves far, so its whole job is to be visible from across the room
  // and to look like it is aiming at you.
  spitter: {
    pal: { p: '#c268b0', q: '#8d4079', r: '#55284a', o: '#ff9d3d', y: '#ffeaa8' },
    scale: 1.04, height: 1.08,
    layers: [
      ['.........', '.........', '.........', '..rr.rr..', '..rr.rr..', '..rr.rr..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..rr.rr..', '..rr.rr..', '..rr.rr..', '.........', '.........', '.........'],
      ['.........', '.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.........', '.........'],
      ['.........', '.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.........', '.........'],
      ['.........', '.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.........', '.........'],
      ['.........', '.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.........', '.........'],
      ['.........', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.........'],
      ['.........', '.ppppppp.', '.ppppppp.', '.ppppppo.', '.ppppppo.', '.ppppppo.', '.ppppppp.', '.ppooopp.', '.........'],
      ['.........', '.ppppppp.', '.ppppppp.', '.ppppppy.', '.ppppppy.', '.ppppppy.', '.ppppppp.', '.ppyyypp.', '.........'],
      ['.........', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.........'],
      ['.........', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.........'],
      ['.........', '.........', '..qqqqq..', '..qqqqq..', '..qqqqq..', '..qqqqq..', '..qqqqq..', '.........', '.........'],
      ['.........', '.........', '.........', '...rrr...', '...rrr...', '...rrr...', '.........', '.........', '.........'],
    ],
  },

  // The heavy. Pauldrons that overhang the arms, a crested helm, and one long
  // arm reaching past the hip — the arm is the tell, because the arm is the
  // three tiles it sweeps.
  sentinel: {
    pal: { s: '#8e9bb0', t: '#65728c', u: '#3f495c', v: '#e6edf5', w: '#161b23' },
    scale: 1.08, height: 1.78,
    layers: [
      ['.........', '.........', '.........', '..ww.ww..', '..ww.ww..', '..ww.ww..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu.t', '........t', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu.t', '........t', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu.t', '........t', '.........', '.........'],
      ['.........', '.........', '.........', 'sstttttss', 'sstttttss', 'sstttttst', '........t', '.........', '.........'],
      ['.........', '.........', '.........', 'sstttttss', 'sstttttss', 'sstttttst', '........t', '.........', '.........'],
      ['.........', '.........', '.........', 'sstttttss', 'sstttttss', 'sstttttst', '........t', '.........', '.........'],
      ['.........', '.........', '.........', 'sstttttss', 'sstttttss', 'sstttttst', '........t', '.........', '.........'],
      ['.........', '.........', 'ss.....ss', 'sstttttss', 'sstttttss', 'sstttttss', 'ss.....ss', '.........', '.........'],
      ['.........', '.........', 'ss.....ss', 'sstttttss', 'sstttttss', 'sstttttss', 'ss.....ss', '.........', '.........'],
      ['.........', '.........', '..sssss..', '..sssss..', '..sssss..', '..sssss..', '..sssss..', '.........', '.........'],
      ['.........', '.........', '..sssss..', '..ssssw..', '..sssss..', '..ssssw..', '..swsws..', '.........', '.........'],
      ['.........', '.........', '..sssss..', '..ssssw..', '..sssss..', '..ssssw..', '..swsws..', '.........', '.........'],
      ['.........', '....v....', '..vvvvv..', '..vvvvv..', '..vvvvv..', '..vvvvv..', '..vvvvv..', '....v....', '.........'],
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
