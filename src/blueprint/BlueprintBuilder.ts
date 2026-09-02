import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { BlockKind } from "./BlockKind";
import { Blueprint } from "./Blueprint";
import { BlueprintBlock } from "./BlueprintBlock";

/**
 * Mutable editing surface. The editor edits one of these; validation and the solver run
 * against the `Blueprint` it builds. Keeping the mutable and immutable forms separate is
 * what lets the runtime hold a stable design to repair against (spec 4.4) while the player
 * keeps editing.
 */
export class BlueprintBuilder {
  private readonly blocks: Map<number, BlueprintBlock>;
  private readonly order: number[];

  public constructor() {
    this.blocks = new Map<number, BlueprintBlock>();
    this.order = [];
  }

  public static fromBlueprint(blueprint: Blueprint): BlueprintBuilder {
    const builder = new BlueprintBuilder();
    for (let i = 0; i < blueprint.blockCount; i++) {
      const block = blueprint.blockAt(i);
      builder.place(block.position, block.material, block.kind, block.facing);
    }
    return builder;
  }

  /** Places or replaces the block at `position`. Returns `this` for chained editing. */
  public place(position: IVec3, material: MaterialId, kind: BlockKind, facing: Direction): BlueprintBuilder {
    const key = BlueprintBuilder.key(position);
    if (!this.blocks.has(key)) {
      this.order.push(key);
    }
    this.blocks.set(key, new BlueprintBlock(position, material, kind, facing));
    return this;
  }

  /** Fills an inclusive box. `from` and `to` may be given in any order. */
  public fillBox(
    from: IVec3,
    to: IVec3,
    material: MaterialId,
    kind: BlockKind,
    facing: Direction
  ): BlueprintBuilder {
    const minX = from.x < to.x ? from.x : to.x;
    const maxX = from.x < to.x ? to.x : from.x;
    const minY = from.y < to.y ? from.y : to.y;
    const maxY = from.y < to.y ? to.y : from.y;
    const minZ = from.z < to.z ? from.z : to.z;
    const maxZ = from.z < to.z ? to.z : from.z;
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          this.place(new IVec3(x, y, z), material, kind, facing);
        }
      }
    }
    return this;
  }

  public remove(position: IVec3): BlueprintBuilder {
    const key = BlueprintBuilder.key(position);
    if (this.blocks.delete(key)) {
      for (let i = 0; i < this.order.length; i++) {
        if (this.order[i] === key) {
          this.order.splice(i, 1);
          break;
        }
      }
    }
    return this;
  }

  public has(position: IVec3): boolean {
    return this.blocks.has(BlueprintBuilder.key(position));
  }

  public get blockCount(): number {
    return this.blocks.size;
  }

  /** Sorts into canonical order and freezes. */
  public build(name: string): Blueprint {
    const collected: BlueprintBlock[] = [];
    for (let i = 0; i < this.order.length; i++) {
      const block = this.blocks.get(this.order[i]);
      if (block !== undefined) {
        collected.push(block);
      }
    }
    collected.sort((a: BlueprintBlock, b: BlueprintBlock): number => {
      return IVec3.compare(a.position, b.position);
    });
    return new Blueprint(name, collected);
  }

  /**
   * Packs a coordinate into a single integer key. The +-512 range is far larger than any
   * P0 arena and keeps the key inside a 32-bit integer, so the map is integer-keyed
   * (`std::unordered_map<int32_t, Block>` after translation) rather than string-keyed.
   */
  private static key(position: IVec3): number {
    const x = position.x + 512;
    const y = position.y + 512;
    const z = position.z + 512;
    if (x < 0 || y < 0 || z < 0 || x > 1023 || y > 1023 || z > 1023) {
      throw new Error("BlueprintBuilder: position out of range " + position.toString());
    }
    return (x << 20) | (y << 10) | z;
  }
}
