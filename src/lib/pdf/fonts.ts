import "server-only";
import path from "path";
import { Font } from "@react-pdf/renderer";

// @react-pdf/renderer's built-in fonts (Helvetica etc.) have no Thai
// glyphs at all — every Thai character would render as blank boxes.
// Sarabun (SIL Open Font License, from Google Fonts) is bundled directly in
// the repo under src/assets/fonts/ rather than fetched at request time, so
// report generation doesn't depend on outbound internet access from the
// VPS. Font.register() throws if called twice with the same family in some
// versions, so this module's side effect is guarded to run once no matter
// how many report routes import it.
let registered = false;

export function registerReportFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "src/assets/fonts");
  Font.register({
    family: "Sarabun",
    fonts: [
      { src: path.join(dir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(dir, "Sarabun-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  registered = true;
}
