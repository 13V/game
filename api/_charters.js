// The goods. Shared by the browser (to draw the shelf) and by the server (to
// decide what a purchase costs and whether it is real), because a price the
// client can name is not a price.
export const CHARTERS = [
  { id: 'granary', name: 'Granary Charter', cost: 30, blurb: '+15 starting food — a deeper pantry' },
  { id: 'timber', name: 'Timberwright Charter', cost: 30, blurb: '+10 starting wood' },
  { id: 'mason', name: 'Mason Charter', cost: 30, blurb: '+8 starting stone' },
  { id: 'purse', name: 'Purse Charter', cost: 30, blurb: '+12 starting gold' },
  { id: 'founders', name: 'Founders Charter', cost: 80, blurb: '+2 founding villagers, housed' },
  { id: 'almoner', name: 'Almoner Charter', cost: 140, blurb: '+2 starting happiness — folk arrive sooner' },
  { id: 'crown', name: 'Crown Charter', cost: 260, blurb: 'a founding town: +6 beds, +25 gold, +20 wood' },
  { id: 'quarrymen', name: 'Quarrymen Charter', cost: 200, blurb: '+18 starting stone — a market on day one' },
  { id: 'dynasty', name: 'Dynasty Charter', cost: 420, blurb: '+4 founding villagers, housed and fed' },
];
export const CHARTER_BY_ID = Object.fromEntries(CHARTERS.map((c) => [c.id, c]));
