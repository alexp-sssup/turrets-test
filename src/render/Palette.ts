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
  public static readonly pad: string = "#2a3444";
  /** The floor between the nearest section and the farthest, in the depth view. */
  public static readonly groundPlane: string = "#171d27";
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

  /**
   * The ground the scene stands on (isometric renderer spec 7).
   *
   * Two tile shades and an accent every four voxels, so distance along the lane is
   * countable without measuring pixels -- a grid *on the ground* rather than over the
   * picture, which is what the flat view's screen-space grid was.
   */
  public static readonly groundTile: string = "#1e2531";
  public static readonly groundTileAlt: string = "#1a212c";
  public static readonly groundAccent: string = "rgba(139,152,171,0.16)";
  /** Contact shadows, which spec 7.3 makes mandatory: without them an actor floats. */
  public static readonly shadow: string = "rgba(6,8,11,0.45)";
  /** The reach plane, drawn as the face of the cutaway (face-placement spec 3.4). */
  public static readonly reachPlane: string = "rgba(95,178,255,0.06)";
  public static readonly reachPlaneLine: string = "rgba(95,178,255,0.22)";
  /** The outline a peeled section is drawn with: the wall cut away in front of the plane. */
  public static readonly peelEdge: string = "#9fb0c6";
  /** The darker edge stroked along a silhouette or a crease (spec 3.1). */
  public static readonly voxelEdge: string = "rgba(9,11,15,0.55)";

  /** Lightens (positive) or darkens (negative) a `#rrggbb` colour, keeping its hue. */
  public static shade(hex: string, amount: number): string {
    return Palette.rgb(
      Palette.channel(hex, 1, amount),
      Palette.channel(hex, 3, amount),
      Palette.channel(hex, 5, amount)
    );
  }

  /**
   * A face fill: the material's own colour, shaded for the face and mixed toward the
   * background for depth (isometric renderer spec 3, spec 6).
   *
   * Shading is **luminance only** and dimming is a mix toward the background rather than an
   * alpha, because a solid cell drawn translucent would make its luminance a function of how
   * many cells sat behind it -- the exact failure UI spec 4 forbids and spec 6.1 rejects an
   * x-ray mode over. Hue stays free for the things that encode on it, so a wood cube and a
   * stone cube stay distinguishable in greyscale at every depth.
   */
  public static faceFill(material: MaterialId, shade: number, dim: number): string {
    return Palette.dimmed(Palette.materialFill(material), shade, dim);
  }

  public static dimmed(hex: string, shade: number, dim: number): string {
    const red = Palette.toBackground(Palette.channel(hex, 1, shade), 1, dim);
    const green = Palette.toBackground(Palette.channel(hex, 3, shade), 3, dim);
    const blue = Palette.toBackground(Palette.channel(hex, 5, shade), 5, dim);
    return Palette.rgb(red, green, blue);
  }

  private static rgb(red: number, green: number, blue: number): string {
    return "rgb(" + red.toString() + "," + green.toString() + "," + blue.toString() + ")";
  }

  private static channel(hex: string, at: number, amount: number): number {
    const value = Number.parseInt(hex.substring(at, at + 2), 16);
    const target = amount >= 0 ? 255 : 0;
    const scaled = amount >= 0 ? amount : -amount;
    return Palette.clampChannel(Math.round(value + (target - value) * scaled));
  }

  private static toBackground(value: number, at: number, amount: number): number {
    if (amount <= 0) {
      return value;
    }
    const target = Number.parseInt(Palette.background.substring(at, at + 2), 16);
    return Palette.clampChannel(Math.round(value + (target - value) * amount));
  }

  private static clampChannel(value: number): number {
    return value < 0 ? 0 : value > 255 ? 255 : value;
  }

  /** Kind badges. Structural blocks get none: the material colour is the whole story. */
  public static kindColour(kind: BlockKind): string {
    if (kind === BlockKind.Station) {
      return "#5fb2ff";
    }
    if (kind === BlockKind.Depot) {
      return "#ffb43a";
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
    if (kind === BlockKind.Hatch) {
      return "≡";
    }
    return "";
  }

  /**
   * Fire, as a two-stop ramp from ignition to consumed.
   *
   * Returned as a `#rrggbb` hex because the face shading of the isometric renderer spec 3
   * shades off a hex, and fire is the one thing allowed to break the luminance-only rule: a
   * burning block is a hue statement.
   */
  public static fireHex(intensity: number): string {
    const clamped = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    const red = Math.round(200 + 55 * clamped);
    const green = Math.round(120 - 70 * clamped);
    return "#" + Palette.hexByte(red) + Palette.hexByte(green) + Palette.hexByte(40);
  }

  public static fireFill(intensity: number): string {
    return Palette.fireHex(intensity);
  }

  private static hexByte(value: number): string {
    const clamped = Palette.clampChannel(Math.round(value));
    return (clamped < 16 ? "0" : "") + clamped.toString(16);
  }

  public static crewColour(role: number): string {
    return Palette.crewHex(role);
  }

  /** Crew by role, as a hex the face shading can work off. */
  public static crewHex(role: number): string {
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
