// A synthetic front-view character with known part boxes, one colour per
// part, and a mark at the face's upper left (the character's right): tells
// left from right and up from down through the whole character pipeline.
export const CARD_COLOURS = { head: [128, 128, 128], mark: [250, 20, 20], torso: [20, 160, 40], armRight: [30, 60, 230], armLeft: [230, 40, 40], legRight: [240, 220, 30], legLeft: [200, 30, 200] };
export function testCard() {
  const C = CARD_COLOURS, card = { width: 160, height: 240, data: new Uint8Array(160 * 240 * 4) };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) card.data.set([...c, 255], (y * 160 + x) * 4); };
  fill(40, 10, 120, 90, C.head);
  fill(44, 14, 62, 30, C.mark);
  fill(70, 90, 90, 95, C.head);       // neck
  fill(50, 95, 110, 172, C.torso);
  fill(30, 95, 48, 180, C.armRight);  // image left = the character's right arm
  fill(112, 95, 130, 180, C.armLeft);
  fill(50, 172, 79, 235, C.legRight);
  fill(81, 172, 110, 235, C.legLeft);
  return card;
}
