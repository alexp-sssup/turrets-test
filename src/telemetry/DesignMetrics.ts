import { IVec3 } from "../core/IVec3";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";

/**
 * The two shape numbers §1.3 asks for, measured off a blueprint.
 *
 * P0's third hypothesis is that firing arcs, crew paths, haul distance, fire and cost make
 * a solid block lose *without a rule saying so*. That cannot be answered by asking testers
 * whether they built blobs; it is answered by measuring the blobbiness of successive
 * attempts and seeing which way it moves.
 *
 * * `stationsPerCell` -- firepower per unit of material. A blob spends cells on volume that
 *   carries no gun.
 * * `enclosedVolumeRatio` -- the fraction of the bounding box that is sealed-in void: empty
 *   cells with no route out of the structure. A hollow shell scores low, a solid lump
 *   scores zero, and a fat design with a wasted interior scores high. Read together with
 *   the fill ratio it separates "hollow and efficient" from "hollow and pointless".
 */
export class DesignMetrics {
  public readonly blockCount: number;
  public readonly stationCount: number;
  public readonly depotCount: number;
  public readonly boundingVolume: number;
  public readonly enclosedVoidCells: number;
  public readonly cost: number;

  public constructor(
    blockCount: number,
    stationCount: number,
    depotCount: number,
    boundingVolume: number,
    enclosedVoidCells: number,
    cost: number
  ) {
    this.blockCount = blockCount;
    this.stationCount = stationCount;
    this.depotCount = depotCount;
    this.boundingVolume = boundingVolume;
    this.enclosedVoidCells = enclosedVoidCells;
    this.cost = cost;
  }

  public get stationsPerCell(): number {
    return this.blockCount > 0 ? this.stationCount / this.blockCount : 0;
  }

  public get enclosedVolumeRatio(): number {
    return this.boundingVolume > 0 ? this.enclosedVoidCells / this.boundingVolume : 0;
  }

  public get fillRatio(): number {
    return this.boundingVolume > 0 ? this.blockCount / this.boundingVolume : 0;
  }

  public static of(blueprint: Blueprint, cost: number): DesignMetrics {
    const bounds = blueprint.bounds;
    return new DesignMetrics(
      blueprint.blockCount,
      blueprint.countOfKind(BlockKind.Station),
      blueprint.countOfKind(BlockKind.Depot),
      bounds.cellCount,
      DesignMetrics.enclosedVoid(blueprint),
      cost
    );
  }

  /**
   * Empty cells inside the bounding box with no 6-connected route out of it.
   *
   * Flood-filled from a one-voxel shell around the design, so "outside" is defined by
   * reachability rather than by a heuristic about walls. A hatch counts as solid here: it
   * is a door, and a corridor behind a closed door is still enclosed volume.
   */
  private static enclosedVoid(blueprint: Blueprint): number {
    const bounds = blueprint.bounds;
    const minX = bounds.min.x - 1;
    const minY = bounds.min.y - 1;
    const minZ = bounds.min.z - 1;
    const sizeX = bounds.size.x + 2;
    const sizeY = bounds.size.y + 2;
    const sizeZ = bounds.size.z + 2;
    const total = sizeX * sizeY * sizeZ;
    const outside = new Uint8Array(total);
    const queue: number[] = [];

    // Seed from every cell of the shell. It is empty by construction: the design's bounds
    // are tight, so nothing of the blueprint sits in it.
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
          const onShell =
            x === 0 || y === 0 || z === 0 || x === sizeX - 1 || y === sizeY - 1 || z === sizeZ - 1;
          if (!onShell) {
            continue;
          }
          const index = x + sizeX * (z + sizeZ * y);
          if (outside[index] === 0) {
            outside[index] = 1;
            queue.push(index);
          }
        }
      }
    }

    let head = 0;
    while (head < queue.length) {
      const index = queue[head];
      head++;
      const y = Math.floor(index / (sizeX * sizeZ));
      const remainder = index - y * sizeX * sizeZ;
      const z = Math.floor(remainder / sizeX);
      const x = remainder - z * sizeX;
      DesignMetrics.visit(blueprint, outside, queue, x + 1, y, z, minX, minY, minZ, sizeX, sizeY, sizeZ);
      DesignMetrics.visit(blueprint, outside, queue, x - 1, y, z, minX, minY, minZ, sizeX, sizeY, sizeZ);
      DesignMetrics.visit(blueprint, outside, queue, x, y + 1, z, minX, minY, minZ, sizeX, sizeY, sizeZ);
      DesignMetrics.visit(blueprint, outside, queue, x, y - 1, z, minX, minY, minZ, sizeX, sizeY, sizeZ);
      DesignMetrics.visit(blueprint, outside, queue, x, y, z + 1, minX, minY, minZ, sizeX, sizeY, sizeZ);
      DesignMetrics.visit(blueprint, outside, queue, x, y, z - 1, minX, minY, minZ, sizeX, sizeY, sizeZ);
    }

    // Anything empty and not reached is sealed in. Only cells inside the design's own
    // bounding box count, so the shell itself never contributes.
    let enclosed = 0;
    for (let y = 1; y < sizeY - 1; y++) {
      for (let z = 1; z < sizeZ - 1; z++) {
        for (let x = 1; x < sizeX - 1; x++) {
          const index = x + sizeX * (z + sizeZ * y);
          if (outside[index] === 1) {
            continue;
          }
          const cell = new IVec3(minX + x, minY + y, minZ + z);
          if (!blueprint.hasBlockAt(cell)) {
            enclosed++;
          }
        }
      }
    }
    return enclosed;
  }

  private static visit(
    blueprint: Blueprint,
    outside: Uint8Array,
    queue: number[],
    x: number,
    y: number,
    z: number,
    minX: number,
    minY: number,
    minZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number
  ): void {
    if (x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ) {
      return;
    }
    const index = x + sizeX * (z + sizeZ * y);
    if (outside[index] === 1) {
      return;
    }
    if (blueprint.hasBlockAt(new IVec3(minX + x, minY + y, minZ + z))) {
      return;
    }
    outside[index] = 1;
    queue.push(index);
  }
}
