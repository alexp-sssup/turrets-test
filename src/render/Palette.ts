import { BlockKind } from "../blueprint/BlockKind";
import { MaterialId } from "../materials/MaterialId";

/** One utilization band: how the stress overlay encodes a range of joint loading. */
export class UtilizationBand {
  public readonly upperBound: number;
  public readonly label: string;
  public readonly fill: string;
  /** Hatch spacing in pixels; 0 means no hatching. */
  public readonly hatchSpacing: number;
  /** True for the cross-hatched bands, which read as "busy" without any colour at all. */
  public readonly crossHatched: boolean;

  public constructor(
    upperBound: number,
    label: string,
    fill: string,
    hatchSpacing: number,
    crossHatched: boolean
  ) {
    this.upperBound = upperBound;
    this.label = label;
    this.fill = fill;
    this.hatchSpacing = hatchSpacing;
    this.crossHatched = crossHatched;
  }
}

/**
 * Every colour in the build, in one place.
 *
 * The one hard constraint (UI spec 4): **utilization must not encode on hue alone.** The
 * four bands below are ordered by luminance as well as by hue -- pale sand, mid amber,
 * dark orange, near-black red -- and each carries a distinct hatch pattern on top. Convert
 * the canvas to greyscale and the bands are still four visibly different textures, which is
 * the property a colourblind tester needs from the hypothesis-critical overlay.
 */
export class Palette {
  public static readonly background: string = "#12151b";
  public static readonly pad: string = "#1d2430";
  public static readonly padLine: string = "#2b3542";
  public static readonly grid: string = "#1a1f28";
  public static readonly sky: string = "#0d1015";
  public static readonly ghost: string = "rgba(150,168,190,0.14)";
  public static readonly text: string = "#dbe4f0";
  public static readonly textDim: string = "#8b98ab";
  public static readonly accent: string = "#5fb2ff";
  public static readonly danger: string = "#ff5c5c";
  public static readonly warning: string = "#ffb43a";
  public static readonly good: string = "#54d18c";

  /** Utilization bands from UI spec 4: <0.5, 0.5-0.8, 0.8-1.0, >1.0. */
  public static readonly bands: readonly UtilizationBand[] = [
    new UtilizationBand(0.5, "<0.5", "#e8e2cf", 0, false),
    new UtilizationBand(0.8, "0.5-0.8", "#e2a53c", 7, false),
    new UtilizationBand(1.0, "0.8-1.0", "#c8541c", 5, true),
    new UtilizationBand(Number.POSITIVE_INFINITY, ">1.0", "#5d0d12", 3, true),
  ];

  public static bandOf(utilization: number): UtilizationBand {
    for (let i = 0; i < Palette.bands.length; i++) {
      if (utilization < Palette.bands[i].upperBound) {
        return Palette.bands[i];
      }
    }
    return Palette.bands[Palette.bands.length - 1];
  }

  public static materialFill(material: MaterialId): string {
    return material === MaterialId.Wood ? "#8a6234" : "#6d7480";
  }

  public static materialEdge(material: MaterialId): string {
    return material === MaterialId.Wood ? "#a8783f" : "#8b93a1";
  }

  /** Kind badges. Structural blocks get none: the material colour is the whole story. */
  public static kindColour(kind: BlockKind): string {
    if (kind === BlockKind.Station) {
      return "#5fb2ff";
    }
    if (kind === BlockKind.Depot) {
      return "#ffb43a";
    }
    if (kind === BlockKind.Core) {
      return "#54d18c";
    }
    if (kind === BlockKind.Hatch) {
      return "#b98bff";
    }
    return "#7f8a99";
  }

  public static kindGlyph(kind: BlockKind): string {
    if (kind === BlockKind.Station) {
      return "▶";
    }
    if (kind === BlockKind.Depot) {
      return "▣";
    }
    if (kind === BlockKind.Core) {
      return "✦";
    }
    if (kind === BlockKind.Hatch) {
      return "≡";
    }
    return "";
  }

  /** Fire, as a two-stop ramp from ignition to consumed. */
  public static fireFill(intensity: number): string {
    const clamped = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    const red = Math.round(200 + 55 * clamped);
    const green = Math.round(120 - 70 * clamped);
    return "rgb(" + red.toString() + "," + green.toString() + ",40)";
  }

  public static crewColour(role: number): string {
    if (role === 1) {
      return "#5fb2ff";
    }
    if (role === 2) {
      return "#54d18c";
    }
    if (role === 3) {
      return "#ffd166";
    }
    return "#8b98ab";
  }
}
