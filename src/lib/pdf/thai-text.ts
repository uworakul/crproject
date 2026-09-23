import "server-only";

// @react-pdf/renderer has a confirmed bug (diegomura/react-pdf#3295):
// internally it decomposes Thai ำ (U+0E33, SARA AM) into ํ (U+0E4D,
// NIKHAHIT) + า (U+0E32, SARA AA) during text layout, but keeps using the
// PRE-decomposition character count for its width/line bookkeeping — the
// string effectively grows by one character per ำ without the layout engine
// knowing, so that many characters get silently dropped off the end of the
// string every time ำ appears (confirmed against this project's own
// company name, "...จำกัด" -> "...จำก", and "จำนวนเงิน" -> "จำนวนเง").
// Workaround (from the GitHub issue): pre-expand ำ into its two-character
// form ourselves before handing the string to <Text>, so react-pdf's
// internal expansion is a no-op and its count stays correct. Sarabun (and
// Thai fonts generally) render ํ+า identically to the precomposed ำ, so
// this is visually invisible — confirmed by rendering both forms and
// extracting the PDF's text content to compare.
export function thaiSafe(text: string): string {
  return text.replace(/ำ/g, "ํา");
}
