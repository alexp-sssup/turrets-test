import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { BlueprintBlock } from "../blueprint/BlueprintBlock";

/** Bumped whenever the on-disk shape changes. Refuse to guess at an unknown version. */
export const BLUEPRINT_FORMAT_VERSION: number = 2;

/**
 * Version 1 wrote five block kinds, with `core` at 3 and `hatch` at 4. Loss-conditions
 * spec 2 deleted the core, so a v1 file's kind numbers mean something else now.
 */
const V1_KIND_CORE: number = 3;
const V1_KIND_HATCH: number = 4;

/**
 * Blueprint to text and back.
 *
 * Spec 3 calls the persisting library "the entire cross-run progression", so the format is
 * deliberately dull: a version number, a name, and six integers per block. No object graph,
 * no class names, nothing that a C++ port would have to reproduce the shape of.
 */
export class BlueprintCodec {
  /** Six integers per block: x, y, z, material, kind, facing. */
  public static encode(blueprint: Blueprint): string {
    const values: number[] = [];
    for (let i = 0; i < blueprint.blockCount; i++) {
      const block = blueprint.blockAt(i);
      values.push(block.position.x);
      values.push(block.position.y);
      values.push(block.position.z);
      values.push(block.material as number);
      values.push(block.kind as number);
      values.push(block.facing as number);
    }
    const payload = {
      version: BLUEPRINT_FORMAT_VERSION,
      name: blueprint.name,
      blocks: values,
    };
    return JSON.stringify(payload);
  }

  /**
   * A short stable fingerprint of a design.
   *
   * Attempt records name the blueprint they were flown with, and "did the tester change
   * the design after the replay" (UI spec 7.3 -- the single most important number in the
   * build) is answered by comparing two of these. FNV-1a over the canonical encoding, so
   * two blueprints hash the same exactly when they encode the same.
   */
  public static hash(blueprint: Blueprint): string {
    const text = BlueprintCodec.encode(blueprint);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash = hash ^ text.charCodeAt(i);
      // 16777619, as shifts, so the arithmetic stays in 32-bit integer range.
      hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) | 0;
    }
    const unsigned = hash < 0 ? hash + 4294967296 : hash;
    return unsigned.toString(16).padStart(8, "0");
  }

  public static decode(text: string): Blueprint {
    const payload = JSON.parse(text) as { version: number; name: string; blocks: number[] };
    if (payload.version !== BLUEPRINT_FORMAT_VERSION && payload.version !== 1) {
      throw new Error("unsupported blueprint format version " + String(payload.version));
    }
    if (payload.blocks.length % 6 !== 0) {
      throw new Error("blueprint block data is not a multiple of six");
    }
    const legacy = payload.version === 1;
    const blocks: BlueprintBlock[] = [];
    for (let i = 0; i < payload.blocks.length; i += 6) {
      const kind = payload.blocks[i + 4];
      blocks.push(
        new BlueprintBlock(
          new IVec3(payload.blocks[i], payload.blocks[i + 1], payload.blocks[i + 2]),
          payload.blocks[i + 3] as MaterialId,
          legacy ? BlueprintCodec.migrateKind(kind) : (kind as BlockKind),
          payload.blocks[i + 5] as Direction
        )
      );
    }
    blocks.sort((a: BlueprintBlock, b: BlueprintBlock): number => {
      return IVec3.compare(a.position, b.position);
    });
    return new Blueprint(payload.name, blocks);
  }

  /**
   * Loss-conditions spec 2: a saved core becomes plain frame of the same material, so the
   * design keeps its geometry, its mass and its bill of materials, and the library survives
   * the change. Spec 3 calls that library "the entire cross-run progression", which is why
   * a v1 file is migrated rather than refused.
   */
  private static migrateKind(kind: number): BlockKind {
    if (kind === V1_KIND_CORE) {
      return BlockKind.Structural;
    }
    if (kind === V1_KIND_HATCH) {
      return BlockKind.Hatch;
    }
    return kind as BlockKind;
  }
}
