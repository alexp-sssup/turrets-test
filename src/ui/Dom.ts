/**
 * The whole of this build's DOM helper library.
 *
 * UI spec 5.5: no UI framework. The panel count is small, and a framework adds a dependency
 * surface and a render-timing question the frame budget does not need -- the canvas already
 * owns the frame clock, and a second scheduler fighting it for the same 16 ms is exactly the
 * confound §1.1 cannot afford.
 */
export class Dom {
  public static require(id: string): HTMLElement {
    const found = document.getElementById(id);
    if (found === null) {
      throw new Error("the page is missing #" + id);
    }
    return found;
  }

  public static clear(element: HTMLElement): void {
    while (element.firstChild !== null) {
      element.removeChild(element.firstChild);
    }
  }

  /** Escapes text for interpolation into a template. Tester-supplied names go through here. */
  public static escape(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Replaces a panel's contents with markup.
   *
   * Panels are rebuilt rather than diffed: they are rebuilt on state changes and at ten
   * hertz at most, never per animation frame, so the cost is irrelevant and the code has no
   * stale-node bugs to have.
   */
  public static setHtml(element: HTMLElement, html: string): void {
    element.innerHTML = html;
  }

  /** Delegated click handling, keyed on a `data-action` attribute. */
  public static onAction(
    root: HTMLElement,
    handler: (action: string, value: string, target: HTMLElement) => void
  ): void {
    root.addEventListener("click", (event: MouseEvent): void => {
      let node = event.target as HTMLElement | null;
      while (node !== null && node !== root) {
        const action = node.getAttribute("data-action");
        if (action !== null) {
          const value = node.getAttribute("data-value");
          handler(action, value === null ? "" : value, node);
          return;
        }
        node = node.parentElement;
      }
    });
  }

  public static onInput(root: HTMLElement, handler: (name: string, value: string) => void): void {
    root.addEventListener("input", (event: Event): void => {
      const node = event.target as HTMLElement | null;
      if (node === null) {
        return;
      }
      const name = node.getAttribute("data-input");
      if (name === null) {
        return;
      }
      handler(name, (node as HTMLInputElement).value);
    });
  }

  /** Number formatting used across the panels, so a margin reads the same everywhere. */
  public static number(value: number, digits: number): string {
    if (!Number.isFinite(value)) {
      return value > 0 ? "∞" : "-∞";
    }
    return value.toFixed(digits);
  }

  public static seconds(value: number): string {
    if (!Number.isFinite(value)) {
      return "never";
    }
    return value.toFixed(1) + "s";
  }

  /**
   * Offers a file to the browser. Used by the attempt export (UI spec 7.5), which has to
   * work with no server behind it.
   */
  public static downloadText(fileName: string, text: string): void {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
