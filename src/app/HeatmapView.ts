import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { BlockKind } from "../blueprint/BlockKind";
import { BlockStructure } from "../structure/BlockStructure";
import { StructuralReport } from "../structure/StructuralReport";

/**
 * Text rendering of a structure, level by level.
 *
 * P0 has no renderer, so this is the heatmap (spec 3 lists it as first-class, not polish).
 * It is intentionally a separate view over `StructuralReport`, not a method on it: the
 * report holds numbers and this decides how to show them, which is the split a real
 * renderer would want too.
 */
export class HeatmapView {
  /** Utilization bands, lowest first. The last one is "failing now". */
  private static readonly RAMP: readonly string[] = [".", ":", "-", "=", "+", "*", "#", "!"];

  /**
   * One character per cell showing how loaded each block is, at each height.
   * `-` means empty space, and a block with no joints at all shows as `?`.
   */
  public static renderUtilization(structure: BlockStructure, report: StructuralReport): string[] {
    return HeatmapView.render(structure, (block: number): string => {
      const utilization = report.maxUtilizationAtBlock(block);
      if (utilization < 0) {
        return "?";
      }
      return HeatmapView.rampCharacter(utilization);
    });
  }

  /** One character per cell showing what each block is for. */
  public static renderKinds(structure: BlockStructure): string[] {
    return HeatmapView.render(structure, (block: number): string => {
      const kind = structure.kindOf(block);
      if (kind === BlockKind.Station) {
        return "S";
      }
      if (kind === BlockKind.Depot) {
        return "D";
      }
      if (kind === BlockKind.Core) {
        return "C";
      }
      if (kind === BlockKind.Hatch) {
        return "H";
      }
      return structure.materialOf(block) === MaterialId.Stone ? "#" : "+";
    });
  }

  /** The legend for `renderUtilization`. */
  public static utilizationLegend(): string {
    let legend = "";
    for (let i = 0; i < HeatmapView.RAMP.length; i++) {
      const upper = (i + 1) / HeatmapView.RAMP.length;
      legend += HeatmapView.RAMP[i] + "<" + upper.toFixed(2) + " ";
    }
    return legend.trim() + "   ! = at or over capacity";
  }

  private static rampCharacter(utilization: number): string {
    if (utilization >= 1) {
      return HeatmapView.RAMP[HeatmapView.RAMP.length - 1];
    }
    const bucket = Math.floor(utilization * (HeatmapView.RAMP.length - 1));
    return HeatmapView.RAMP[bucket < 0 ? 0 : bucket];
  }

  /**
   * Renders each y level as a block of rows, z increasing downward and x rightward, so the
   * attacker's approach (-z) is at the top of each level.
   */
  private static render(
    structure: BlockStructure,
    characterFor: (block: number) => string
  ): string[] {
    const bounds = structure.blueprint.bounds;
    const lines: string[] = [];
    for (let y = bounds.min.y + bounds.size.y - 1; y >= bounds.min.y; y--) {
      let occupied = false;
      const level: string[] = [];
      for (let z = bounds.min.z; z < bounds.min.z + bounds.size.z; z++) {
        let row = "";
        for (let x = bounds.min.x; x < bounds.min.x + bounds.size.x; x++) {
          const block = structure.indexAt(new IVec3(x, y, z));
          if (block < 0) {
            row += " ";
          } else {
            row += characterFor(block);
            occupied = true;
          }
        }
        level.push("    " + row);
      }
      if (!occupied) {
        continue;
      }
      lines.push("  y=" + y.toString());
      for (let i = 0; i < level.length; i++) {
        lines.push(level[i]);
      }
    }
    return lines;
  }
}
