/**
 * Whether a cell holds a block that is drawn (isometric renderer spec 3).
 *
 * The face-visibility rules, the occlusion rule of spec 3.3 and the edge rule of spec 3.1
 * are all questions about a cell's neighbours and about nothing else, so they take this
 * instead of a frame. The renderer injects the live blueprint; a test injects a hand-written
 * set of cells, which is how spec 3's claims are pinned without a canvas.
 */
export interface CellPresence {
  isSolid(x: number, y: number, z: number): boolean;
}
