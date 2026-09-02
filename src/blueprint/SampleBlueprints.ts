import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { PadSurface } from "../structure/SupportSurface";
import { BlockKind } from "./BlockKind";
import { Blueprint } from "./Blueprint";
import { BlueprintBuilder } from "./BlueprintBuilder";

/**
 * Designs used by the CLI harness and by tests.
 *
 * They are authored rather than generated because P0's question is whether a *player* can
 * read the solver, and a hand-built turret with a deliberate weakness is the only kind of
 * fixture that can answer that. The attacker comes down the lane from -z, so that is the
 * direction the guns face.
 */
export class SampleBlueprints {
  /** The pad the arena marks out: five by five at ground level. */
  public static pad(): PadSurface {
    return new PadSurface(0, 0, 4, 0, 4);
  }

  /**
   * A sound, valid, affordable turret: stone floor, wood walls, two stations covering the
   * lane, two dispersed depots, a hatch at the back, and the core sunk into the stone floor
   * where a flat trajectory cannot reach it. 43 blocks and 93 of the 500 material budget,
   * so there is plenty of room for a player to make it worse.
   *
   * The core's placement is the fixture's one piece of real design. An earlier version put
   * it at wall height directly behind the middle station, and three light kinetic rounds
   * ended the run in wave one: the first two killed the station and the third carried
   * through the gap into the core. Sinking it into the floor is the fix a player would
   * arrive at, and it is the sort of thing P0 exists to surface.
   */
  public static standardTurret(): Blueprint {
    const builder = new BlueprintBuilder();
    builder.fillBox(
      new IVec3(0, 0, 0),
      new IVec3(4, 0, 4),
      MaterialId.Stone,
      BlockKind.Structural,
      Direction.PosZ
    );
    builder.place(new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Core, Direction.PosZ);
    SampleBlueprints.addWalls(builder);
    builder.place(new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(3, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(2, 1, 4), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ);
    builder.place(new IVec3(1, 1, 1), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    builder.place(new IVec3(3, 1, 3), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    return builder.build("standard turret");
  }

  /**
   * The same turret with a second station buried behind the first, so it has no arc. Used
   * to show that firing arcs are a real geometric pressure and not a flag (spec 1.3).
   */
  public static buriedStationTurret(): Blueprint {
    const builder = BlueprintBuilder.fromBlueprint(SampleBlueprints.standardTurret());
    builder.place(new IVec3(1, 1, 1), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    return builder.build("buried station");
  }

  /** A turret whose depot is walled off from its station: the gun fires its rack dry. */
  public static severedDepotTurret(): Blueprint {
    const builder = new BlueprintBuilder();
    builder.fillBox(
      new IVec3(0, 0, 0),
      new IVec3(4, 0, 4),
      MaterialId.Stone,
      BlockKind.Structural,
      Direction.PosZ
    );
    SampleBlueprints.addWalls(builder);
    builder.place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(2, 1, 4), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ);
    builder.place(new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Core, Direction.PosZ);
    // A depot in its own sealed cell in the corner, walled in on both open sides.
    builder.place(new IVec3(3, 1, 3), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    builder.place(new IVec3(2, 1, 3), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    builder.place(new IVec3(3, 1, 2), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    builder.place(new IVec3(3, 2, 3), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    return builder.build("severed depot");
  }

  /**
   * A wood tower with the station on a long unbraced arm. Structurally unsound on purpose:
   * the sort of design the heatmap is supposed to warn a player about before wave 1.
   */
  public static overreachingTurret(): Blueprint {
    const builder = new BlueprintBuilder();
    // Wood rather than stone underfoot on purpose. A wood column on a stone floor is a
    // hinge -- the interface inherits stone's zero tension, so its bending capacity is
    // proportional to the load it already carries and the failure becomes a hard boundary
    // with no joint force to point at. Keeping the base wood makes the arm's root joint
    // the thing that gives way, which is the failure this fixture is for.
    builder.fillBox(
      new IVec3(0, 0, 0),
      new IVec3(2, 0, 2),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    builder.fillBox(
      new IVec3(1, 1, 1),
      new IVec3(1, 3, 1),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    for (let z = 0; z >= -4; z--) {
      builder.place(new IVec3(1, 3, z), MaterialId.Wood, BlockKind.Structural, Direction.NegZ);
    }
    builder.place(new IVec3(1, 3, -5), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    builder.place(new IVec3(2, 1, 2), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ);
    builder.place(new IVec3(0, 1, 2), MaterialId.Wood, BlockKind.Core, Direction.PosZ);
    return builder.build("overreaching");
  }

  /** Perimeter walls one voxel tall, with the corners of the 5x5 footprint. */
  private static addWalls(builder: BlueprintBuilder): void {
    for (let x = 0; x <= 4; x++) {
      builder.place(new IVec3(x, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.NegZ);
      builder.place(new IVec3(x, 1, 4), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    }
    for (let z = 1; z <= 3; z++) {
      builder.place(new IVec3(0, 1, z), MaterialId.Wood, BlockKind.Structural, Direction.NegX);
      builder.place(new IVec3(4, 1, z), MaterialId.Wood, BlockKind.Structural, Direction.PosX);
    }
  }
}
