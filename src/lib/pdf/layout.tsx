import "server-only";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerReportFonts } from "./fonts";
import { thaiSafe } from "./thai-text";

registerReportFonts();

// Every piece of Thai text rendered anywhere in a report PDF goes through
// this instead of <Text> directly — see thai-text.ts for why. Accepts the
// same children shapes every call site here already uses: a plain string,
// or a small mix of strings/numbers/JSX (e.g. `{a} — {b}`) — only string
// children need the fix; numbers and other nodes pass through untouched.
function fixChildren(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") return thaiSafe(node);
  if (Array.isArray(node)) return node.map(fixChildren);
  return node;
}
// react-pdf's own Style prop type is a large internal union not worth
// re-deriving here; every call site just passes a plain inline style object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SafeText({ children, style }: { children?: React.ReactNode; style?: any }) {
  return <Text style={style}>{fixChildren(children)}</Text>;
}

export const styles = StyleSheet.create({
  page: { fontFamily: "Sarabun", fontSize: 9, padding: 24, color: "#111827" },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#4b5563", marginBottom: 1 },
  headerRow: { marginBottom: 10, borderBottom: "1pt solid #d1d5db", paddingBottom: 8 },
  table: { display: "flex", width: "100%", borderTop: "1pt solid #9ca3af", borderLeft: "1pt solid #9ca3af" },
  tr: { flexDirection: "row" },
  // Border/background live on the View (the actual table cell); the Text
  // inside is just padded, unstyled-otherwise content — putting border +
  // wrapping text on the same <Text> node (the original design) is what
  // caused adjacent cells to visually overlap once a long site/dept name
  // wrapped onto a second line (a Yoga flex/text-wrap interaction bug,
  // confirmed by screenshot: "เลขที่เอกสาร" rendering on top of a wrapped
  // "หน่วยงาน" cell). A View wrapping Text lets Yoga size the row by the
  // tallest CELL rather than the tallest bare Text run.
  thCellBox: { borderRight: "1pt solid #9ca3af", borderBottom: "1pt solid #9ca3af", backgroundColor: "#f3f4f6", padding: 3 },
  tdCellBox: { borderRight: "1pt solid #9ca3af", borderBottom: "1pt solid #9ca3af", padding: 3 },
  thText: { fontWeight: "bold" },
  totalRowBox: { backgroundColor: "#f9fafb" },
  footer: { position: "absolute", bottom: 12, left: 24, right: 24, fontSize: 7, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

// Shared page chrome for every report: company name + report title + a
// free-form line describing the active filters, a generated-at footer with
// page numbers, and consistent A4 margins/font. Every report PDF wraps its
// own content in this instead of reassembling the same header by hand.
export function ReportPage({
  companyName,
  title,
  filterSummary,
  orientation = "portrait",
  children,
}: {
  companyName: string;
  title: string;
  filterSummary: string;
  orientation?: "portrait" | "landscape";
  children: React.ReactNode;
}) {
  const generatedAt = new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  return (
    <Document>
      <Page size="A4" orientation={orientation} style={styles.page} wrap>
        <View style={styles.headerRow} fixed>
          <SafeText style={styles.title}>{companyName}</SafeText>
          <SafeText style={styles.subtitle}>{title}</SafeText>
          {filterSummary ? <SafeText style={styles.subtitle}>{filterSummary}</SafeText> : null}
        </View>
        {children}
        <View style={styles.footer} fixed>
          <SafeText>พิมพ์เมื่อ {generatedAt}</SafeText>
          <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export interface ReportColumn {
  key: string;
  header: string;
  width: number; // flex weight (relative), not fixed pt
  align?: "left" | "right" | "center";
}

// Generic table used by every "flat list" / "matrix" report (bank
// remittance, department/site summary, debt reports, employee registry) —
// rows are pre-formatted strings so the same component works regardless of
// what the underlying numbers mean.
export function ReportTable({
  columns,
  rows,
  totalRow,
  boldRowIndices,
}: {
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
  // Row indices (within `rows`) to render like the grand-total row — used
  // for per-group subtotal rows when the report is grouped (see
  // src/lib/reports/group-sort.ts). Grand totalRow itself is unaffected;
  // it always renders bold via its own dedicated block below.
  boldRowIndices?: number[];
}) {
  const boldSet = new Set(boldRowIndices ?? []);
  return (
    <View style={styles.table}>
      <View style={styles.tr} fixed>
        {columns.map((c) => (
          <View key={c.key} style={{ ...styles.thCellBox, flex: c.width }}>
            <SafeText style={{ ...styles.thText, textAlign: c.align ?? "left" }}>{c.header}</SafeText>
          </View>
        ))}
      </View>
      {rows.map((row, i) => {
        const bold = boldSet.has(i);
        return (
          <View style={styles.tr} key={i} wrap={false}>
            {columns.map((c, j) => (
              <View key={c.key} style={{ ...styles.tdCellBox, ...(bold ? styles.totalRowBox : {}), flex: c.width }}>
                <SafeText style={{ textAlign: c.align ?? "left", ...(bold ? { fontWeight: "bold" } : {}) }}>{row[j] ?? ""}</SafeText>
              </View>
            ))}
          </View>
        );
      })}
      {totalRow && (
        <View style={styles.tr} wrap={false}>
          {columns.map((c, j) => (
            <View key={c.key} style={{ ...styles.tdCellBox, ...styles.totalRowBox, flex: c.width }}>
              <SafeText style={{ textAlign: c.align ?? "left", fontWeight: "bold" }}>{totalRow[j] ?? ""}</SafeText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function money(v: number | string) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
