import "./styles.css";
import { App } from "./App";
import { Dom } from "./Dom";

/**
 * Boot. One URL, no install, no account, no build step for the tester (UI spec 7.1).
 *
 * Everything below the canvas is set up by `App`; this file exists to fail loudly if the
 * page it was given is not the page it expects, because a silent blank canvas is the worst
 * possible first thirty seconds.
 */
function boot(): void {
  const canvas = Dom.require("field") as HTMLCanvasElement;
  const panels = Dom.require("panels");
  const shell = Dom.require("shell");
  const app = new App(canvas, panels, shell);
  app.start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
