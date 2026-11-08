// lib/xlsxWriter.ts
// A tiny, dependency-free .xlsx writer for React Native / Expo.
// It writes the Office Open XML parts directly (styles, sheets, native Excel charts) and packs
// them into a ZIP (stored, no compression), so no ExcelJS / SheetJS / JSZip install is needed.
// Formulas are written WITH cached values, so previews (Quick Look, Google Drive, Files app) show
// numbers immediately and Excel still recalculates everything when the file is opened.

/* ───────────────────────────── small helpers ───────────────────────────── */

const stripInvalid = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');

export const esc = (s: string) =>
  stripInvalid(String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (v: number) => (Number.isFinite(v) ? String(v) : '0');

export const colName = (c: number): string => {
  let s = '';
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
};

/** 1-based row / column -> "B7" (or "$B$7" when abs). */
export const ref = (r: number, c: number, abs = false) =>
  abs ? `$${colName(c)}$${r}` : `${colName(c)}${r}`;

export const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** Absolute cross-sheet range, e.g. 'All Transactions'!$H$6:$H$40 */
export const sheetRange = (sheet: string, r1: number, c1: number, r2: number, c2: number) =>
  `${quoteSheet(sheet)}!${ref(r1, c1, true)}:${ref(r2, c2, true)}`;

function utf8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

/* ───────────────────────────── ZIP (stored) ───────────────────────────── */

let CRC_TABLE: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = utf8(f.name);
    const crc = crc32(f.data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);

    chunks.push(local, f.data);
    central.push(cen);
    offset += local.length + f.data.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const total = all.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of all) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/* ───────────────────────────── styles ───────────────────────────── */

export interface StyleSpec {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string; // hex RRGGBB
  fill?: string; // hex RRGGBB
  h?: 'left' | 'center' | 'right';
  v?: 'top' | 'center' | 'bottom';
  wrap?: boolean;
  indent?: number;
  numFmt?: string;
  /** Borders as "style:RRGGBB", e.g. "thin:D9E1EC" or "medium:2563EB". */
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

const DEFAULT_TEXT = '1F2937';

const BUILTIN_FMT: Record<string, number> = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };

class StyleBook {
  private fonts: string[] = [];
  private fills: string[] = [];
  private borders: string[] = [];
  private fmts: string[] = [];
  private xfs: string[] = [];
  private cache = new Map<string, number>();
  private fontIdx = new Map<string, number>();
  private fillIdx = new Map<string, number>();
  private borderIdx = new Map<string, number>();
  private fmtIdx = new Map<string, number>();

  constructor() {
    this.font({});
    this.fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
    this.border({});
    this.get({}); // xf 0 = default
  }

  private font(s: StyleSpec): number {
    const xml =
      `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size ?? 10}"/>` +
      `<color rgb="FF${s.color ?? DEFAULT_TEXT}"/><name val="Arial"/><family val="2"/></font>`;
    let i = this.fontIdx.get(xml);
    if (i === undefined) {
      i = this.fonts.length;
      this.fonts.push(xml);
      this.fontIdx.set(xml, i);
    }
    return i;
  }

  private fill(hex?: string): number {
    if (!hex) return 0;
    const xml = `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex}"/><bgColor indexed="64"/></patternFill></fill>`;
    let i = this.fillIdx.get(xml);
    if (i === undefined) {
      i = this.fills.length;
      this.fills.push(xml);
      this.fillIdx.set(xml, i);
    }
    return i;
  }

  private border(s: StyleSpec): number {
    const side = (tag: string, spec?: string) => {
      if (!spec) return `<${tag}/>`;
      const [style, color] = spec.split(':');
      return `<${tag} style="${style}"><color rgb="FF${color}"/></${tag}>`;
    };
    const xml = `<border>${side('left', s.left)}${side('right', s.right)}${side('top', s.top)}${side('bottom', s.bottom)}<diagonal/></border>`;
    let i = this.borderIdx.get(xml);
    if (i === undefined) {
      i = this.borders.length;
      this.borders.push(xml);
      this.borderIdx.set(xml, i);
    }
    return i;
  }

  private fmt(code?: string): number {
    if (!code) return 0;
    if (code in BUILTIN_FMT) return BUILTIN_FMT[code];
    let i = this.fmtIdx.get(code);
    if (i === undefined) {
      i = 164 + this.fmts.length;
      this.fmts.push(`<numFmt numFmtId="${i}" formatCode="${esc(code)}"/>`);
      this.fmtIdx.set(code, i);
    }
    return i;
  }

  get(s: StyleSpec): number {
    const key = JSON.stringify(s);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const align =
      s.h || s.v || s.wrap || s.indent
        ? `<alignment${s.h || s.indent ? ` horizontal="${s.h ?? 'left'}"` : ''} vertical="${s.v ?? 'center'}"${s.wrap ? ' wrapText="1"' : ''}${s.indent ? ` indent="${s.indent}"` : ''}/>`
        : '<alignment vertical="center"/>';
    const xf =
      `<xf numFmtId="${this.fmt(s.numFmt)}" fontId="${this.font(s)}" fillId="${this.fill(s.fill)}" borderId="${this.border(s)}" xfId="0" ` +
      `applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`;
    const id = this.xfs.length;
    this.xfs.push(xf);
    this.cache.set(key, id);
    return id;
  }

  xml(): string {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (this.fmts.length ? `<numFmts count="${this.fmts.length}">${this.fmts.join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `<dxfs count="1"><dxf><font><b/><color rgb="FFDC2626"/></font></dxf></dxfs>` +
      `</styleSheet>`
    );
  }
}

/* ───────────────────────────── charts ───────────────────────────── */

export interface ChartSeries {
  name: string;
  /** Cell holding the series name, e.g. 'Summary'!$D$34 */
  nameRef: string;
  catRef: string;
  valRef: string;
  cats: (string | number)[];
  vals: number[];
  color?: string;
}

export interface ChartSpec {
  kind: 'column' | 'bar' | 'doughnut';
  title: string;
  /** Zero-based anchors. dx / dy are offsets in EMU. */
  from: { col: number; row: number; dx?: number; dy?: number };
  to: { col: number; row: number; dx?: number; dy?: number };
  series: ChartSeries[];
  /** Categories are numbers (e.g. dates) shown with catFormat. */
  catIsNumeric?: boolean;
  catFormat?: string;
  valFormat?: string;
  legend?: boolean;
  showValues?: boolean;
  /** Per-slice colours for doughnut charts. */
  sliceColors?: string[];
}

const NS_C =
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const txPr = (sz: number, color: string, bold = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">` +
  `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr>` +
  `<a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;

function seriesXml(spec: ChartSpec, s: ChartSeries, i: number): string {
  const tx =
    `<c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f><c:strCache><c:ptCount val="1"/>` +
    `<c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;

  const catPts = s.cats
    .map((c, idx) => `<c:pt idx="${idx}"><c:v>${esc(String(c))}</c:v></c:pt>`)
    .join('');
  const cat = spec.catIsNumeric
    ? `<c:cat><c:numRef><c:f>${esc(s.catRef)}</c:f><c:numCache><c:formatCode>${esc(spec.catFormat ?? 'General')}</c:formatCode>` +
      `<c:ptCount val="${s.cats.length}"/>${catPts}</c:numCache></c:numRef></c:cat>`
    : `<c:cat><c:strRef><c:f>${esc(s.catRef)}</c:f><c:strCache><c:ptCount val="${s.cats.length}"/>${catPts}</c:strCache></c:strRef></c:cat>`;

  const valPts = s.vals.map((v, idx) => `<c:pt idx="${idx}"><c:v>${num(v)}</c:v></c:pt>`).join('');
  const val =
    `<c:val><c:numRef><c:f>${esc(s.valRef)}</c:f><c:numCache><c:formatCode>${esc(spec.valFormat ?? 'General')}</c:formatCode>` +
    `<c:ptCount val="${s.vals.length}"/>${valPts}</c:numCache></c:numRef></c:val>`;

  const color = s.color ?? '16A34A';

  if (spec.kind === 'doughnut') {
    const colors = spec.sliceColors ?? [];
    const dPts = s.vals
      .map(
        (_, idx) =>
          `<c:dPt><c:idx val="${idx}"/><c:bubble3D val="0"/><c:spPr>${solid(colors[idx % colors.length] ?? color)}` +
          `<a:ln w="19050">${solid('FFFFFF')}</a:ln></c:spPr></c:dPt>`,
      )
      .join('');
    const dLbls =
      `<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, 'FFFFFF', true)}` +
      `<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${dPts}${dLbls}${cat}${val}</c:ser>`;
  }

  const dLbls = spec.showValues
    ? `<c:dLbls><c:numFmt formatCode="${esc(spec.valFormat ?? 'General')}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800, '4B5563')}` +
      `<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
    : '';

  return (
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr>${solid(color)}<a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:invertIfNegative val="0"/>${dLbls}${cat}${val}</c:ser>`
  );
}

function chartXml(spec: ChartSpec): string {
  const sers = spec.series.map((s, i) => seriesXml(spec, s, i)).join('');
  const horizontal = spec.kind === 'bar';

  let plot: string;
  if (spec.kind === 'doughnut') {
    plot = `<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>` +
      `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
  } else {
    const axLine = `<c:spPr><a:ln w="9525">${solid('C5D6CB')}</a:ln></c:spPr>`;
    const grid = `<c:majorGridlines><c:spPr><a:ln w="6350">${solid('E3EDE6')}</a:ln></c:spPr></c:majorGridlines>`;
    const catAx =
      `<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/>` +
      `<c:axPos val="${horizontal ? 'l' : 'b'}"/>` +
      (spec.catIsNumeric ? `<c:numFmt formatCode="${esc(spec.catFormat ?? 'General')}" sourceLinked="0"/>` : '') +
      `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr(900, '4B5563')}` +
      `<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
    const valAx =
      `<c:valAx><c:axId val="500000002"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/>` +
      `<c:axPos val="${horizontal ? 'b' : 'l'}"/>${grid}<c:numFmt formatCode="${esc(spec.valFormat ?? 'General')}" sourceLinked="0"/>` +
      `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, '6B7280')}` +
      `<c:crossAx val="500000001"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
    plot =
      `<c:plotArea><c:layout/><c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
      `${sers}<c:gapWidth val="${spec.series.length > 1 ? 70 : 55}"/>${spec.series.length > 1 ? '<c:overlap val="-8"/>' : ''}` +
      `<c:axId val="500000001"/><c:axId val="500000002"/></c:barChart>${catAx}${valAx}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
  }

  const legendPos = spec.kind === 'doughnut' ? 'r' : 'b';
  const legend = spec.legend
    ? `<c:legend><c:legendPos val="${legendPos}"/><c:overlay val="0"/>${txPr(900, '4B5563')}</c:legend>`
    : '';

  const title =
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr>` +
    `<a:r><a:rPr lang="en-US" sz="1200" b="1">${solid('0B3D2A')}<a:latin typeface="Arial"/></a:rPr><a:t>${esc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace ${NS_C}>` +
    `<c:date1904 val="0"/><c:roundedCorners val="0"/><c:chart>${title}<c:autoTitleDeleted val="0"/>${plot}${legend}` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr>${solid('FFFFFF')}<a:ln w="9525">${solid('D5E5DA')}</a:ln></c:spPr>${txPr(900, '4B5563')}</c:chartSpace>`
  );
}

function drawingXml(charts: ChartSpec[]): string {
  const anchors = charts
    .map((c, i) => {
      const pos = (p: ChartSpec['from'], tag: string) =>
        `<xdr:${tag}><xdr:col>${p.col}</xdr:col><xdr:colOff>${p.dx ?? 0}</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>${p.dy ?? 0}</xdr:rowOff></xdr:${tag}>`;
      return (
        `<xdr:twoCellAnchor editAs="oneCell">${pos(c.from, 'from')}${pos(c.to, 'to')}` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}" descr="${esc(c.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
        `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/>` +
        `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
      );
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`
  );
}

/* ───────────────────────────── sheets ───────────────────────────── */

interface Cell {
  v: string | number | null;
  f?: string;
  s: number;
}

export class Sheet {
  private rows = new Map<number, Map<number, Cell>>();
  private heights = new Map<number, number>();
  private widths: number[] = [];
  private merges: string[] = [];
  private cond: string[] = [];
  private condPriority = 1;
  freezeRow?: number; // rows above this 1-based row stay frozen
  autoFilter?: string;
  charts: ChartSpec[] = [];
  tabColor?: string;
  footerTitle = '';
  landscape = true;
  /** 0 = as many pages tall as needed, 1 = squeeze onto one page. */
  fitToHeight = 0;

  constructor(
    public readonly name: string,
    private readonly book: StyleBook,
  ) {}

  width(col: number, w: number) {
    this.widths[col - 1] = w;
  }

  height(row: number, h: number) {
    this.heights.set(row, h);
  }

  set(r: number, c: number, value: string | number | null, style: StyleSpec = {}, formula?: string) {
    let row = this.rows.get(r);
    if (!row) {
      row = new Map();
      this.rows.set(r, row);
    }
    row.set(c, { v: value, f: formula, s: this.book.get(style) });
  }

  /** Merge a range, put the value/formula in the top-left cell and apply the style to every cell. */
  merge(r1: number, c1: number, r2: number, c2: number, value: string | number | null, style: StyleSpec = {}, formula?: string) {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) this.set(r, c, value, style, formula);
        else this.set(r, c, null, style);
      }
    }
    if (r1 !== r2 || c1 !== c2) this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`);
  }

  dataBar(rangeRef: string, color: string, min = 0, max = 1) {
    this.cond.push(
      `<conditionalFormatting sqref="${rangeRef}"><cfRule type="dataBar" priority="${this.condPriority++}"><dataBar>` +
        `<cfvo type="num" val="${min}"/><cfvo type="num" val="${max}"/><color rgb="FF${color}"/></dataBar></cfRule></conditionalFormatting>`,
    );
  }

  /** Red bold text when a cell is greater than `value` (uses dxf 0). */
  highlightAbove(rangeRef: string, value: number) {
    this.cond.push(
      `<conditionalFormatting sqref="${rangeRef}"><cfRule type="cellIs" dxfId="0" priority="${this.condPriority++}" operator="greaterThan">` +
        `<formula>${value}</formula></cfRule></conditionalFormatting>`,
    );
  }

  xml(index: number, hasDrawing: boolean): string {
    let maxR = 1;
    let maxC = 1;
    this.rows.forEach((cols, r) => {
      maxR = Math.max(maxR, r);
      cols.forEach((_, c) => (maxC = Math.max(maxC, c)));
    });

    const cols = this.widths
      .map((w, i) => (w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : ''))
      .join('');

    const rowXml = Array.from(this.rows.keys())
      .sort((a, b) => a - b)
      .map((r) => {
        const cells = this.rows.get(r)!;
        const ht = this.heights.get(r);
        const cellXml = Array.from(cells.keys())
          .sort((a, b) => a - b)
          .map((c) => {
            const cell = cells.get(c)!;
            const a = ref(r, c);
            if (cell.f !== undefined) {
              if (typeof cell.v === 'string')
                return `<c r="${a}" s="${cell.s}" t="str"><f>${esc(cell.f)}</f><v>${esc(cell.v)}</v></c>`;
              return `<c r="${a}" s="${cell.s}"><f>${esc(cell.f)}</f><v>${num(Number(cell.v ?? 0))}</v></c>`;
            }
            if (cell.v === null || cell.v === '') return `<c r="${a}" s="${cell.s}"/>`;
            if (typeof cell.v === 'number') return `<c r="${a}" s="${cell.s}"><v>${num(cell.v)}</v></c>`;
            const text = stripInvalid(cell.v).slice(0, 32000);
            return `<c r="${a}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
          })
          .join('');
        return `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cellXml}</row>`;
      })
      .join('');

    const pane = this.freezeRow
      ? `<pane ySplit="${this.freezeRow - 1}" topLeftCell="A${this.freezeRow}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.freezeRow}" sqref="A${this.freezeRow}"/>`
      : '';

    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheetPr>${this.tabColor ? `<tabColor rgb="FF${this.tabColor}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>` +
      `<dimension ref="A1:${ref(maxR, maxC)}"/>` +
      `<sheetViews><sheetView showGridLines="0"${index === 0 ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="18" customHeight="1"/>` +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${rowXml}</sheetData>` +
      (this.autoFilter ? `<autoFilter ref="${this.autoFilter}"/>` : '') +
      (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
      this.cond.join('') +
      `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>` +
      `<pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="${this.fitToHeight}"/>` +
      `<headerFooter><oddFooter>&amp;L${esc(this.footerTitle.replace(/&/g, '&&'))}&amp;CPage &amp;P of &amp;N&amp;R&amp;D</oddFooter></headerFooter>` +
      (hasDrawing ? `<drawing r:id="rId1"/>` : '') +
      `</worksheet>`
    );
  }
}

/* ───────────────────────────── workbook ───────────────────────────── */

export class Workbook {
  readonly styles = new StyleBook();
  readonly sheets: Sheet[] = [];
  title = 'Workbook';
  creator = 'App';

  addSheet(name: string, tabColor?: string): Sheet {
    const s = new Sheet(name, this.styles);
    s.tabColor = tabColor;
    s.footerTitle = this.title;
    this.sheets.push(s);
    return s;
  }

  build(): Uint8Array {
    const files: { name: string; data: Uint8Array }[] = [];
    const add = (name: string, xml: string) => files.push({ name, data: utf8(xml) });
    const HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

    const overrides: string[] = [];
    let drawingCount = 0;
    let chartCount = 0;

    this.sheets.forEach((sheet, i) => {
      const hasDrawing = sheet.charts.length > 0;
      add(`xl/worksheets/sheet${i + 1}.xml`, sheet.xml(i, hasDrawing));
      overrides.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);

      if (hasDrawing) {
        drawingCount++;
        add(
          `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
          `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing${drawingCount}.xml"/></Relationships>`,
        );
        add(`xl/drawings/drawing${drawingCount}.xml`, drawingXml(sheet.charts));
        overrides.push(`<Override PartName="/xl/drawings/drawing${drawingCount}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);

        const rels = sheet.charts
          .map((chart, k) => {
            chartCount++;
            add(`xl/charts/chart${chartCount}.xml`, chartXml(chart));
            overrides.push(`<Override PartName="/xl/charts/chart${chartCount}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
            return `<Relationship Id="rId${k + 1}" Type="${REL}/chart" Target="../charts/chart${chartCount}.xml"/>`;
          })
          .join('');
        add(`xl/drawings/_rels/drawing${drawingCount}.xml.rels`, `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
      }
    });

    add('xl/styles.xml', this.styles.xml());

    add(
      'xl/workbook.xml',
      `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
        `<bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
        this.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        `</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    );

    add(
      'xl/_rels/workbook.xml.rels',
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${this.sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    );

    add(
      '_rels/.rels',
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    );

    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    add(
      'docProps/core.xml',
      `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.creator)}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`,
    );
    add(
      'docProps/app.xml',
      `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>`,
    );

    // [Content_Types].xml goes first in the archive.
    const contentTypes = utf8(
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
        overrides.join('') +
        `</Types>`,
    );
    return zip([{ name: '[Content_Types].xml', data: contentTypes }, ...files]);
  }
}
