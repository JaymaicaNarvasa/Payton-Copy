// lib/expenseReport.ts
// Fetches ALL of a user's data from Supabase and turns it into a professional multi-sheet Excel report:
//   1. Summary            – KPI cards, two charts, monthly trend + top periods tables
//   2. Monthly Expenses   – one table per month with a monthly total, plus a grand total
//   3. Allowance Periods  – every allowance (Personal: "Income Periods") with spent / remaining / % used,
//                           a Total row and two charts
//   4. Categories        – spending by category (table, charts, category-by-month grid)
//   5. All Transactions   – the full ledger with filters (also the source for every formula)
//
// Spender  -> all of their own allowances + expenses
// Sponsor  -> all allowances the sponsor gave the selected spender + their expenses
// Personal -> all income sources + expenses
import { supabase } from './supabase';
import { Workbook, sheetRange, quoteSheet } from './xlsxWriter';
import type { Sheet, StyleSpec, ChartSpec } from './xlsxWriter';

/* ───────────────────────────── public API ───────────────────────────── */

export interface ExportOptions {
  userId: string;
  role: string | null;
  /** Required for Sponsors: the spender whose data is exported. */
  spenderId?: string | null;
}

export interface ExportResult {
  bytes: Uint8Array;
  fileName: string;
  logDetails: string;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function generateExpenseReport(opts: ExportOptions): Promise<ExportResult> {
  const role: Role = opts.role === 'Sponsor' ? 'Sponsor' : opts.role === 'Spender' ? 'Spender' : 'Personal';
  const me = await getProfile(opts.userId);

  let owner = me;
  let sponsor: Profile | null = null;
  let periodsRaw: any[] = [];
  let fk: 'allowance_id' | 'income_id' = 'allowance_id';

  if (role === 'Sponsor') {
    if (!opts.spenderId) throw new Error('Please select a spender first before exporting.');
    owner = await getProfile(opts.spenderId);
    sponsor = me;
    const { data, error } = await supabase
      .from('allowances')
      .select('id, allowance_name, amount, start_date, end_date')
      .eq('sponsor_id', opts.userId)
      .eq('spender_id', opts.spenderId);
    if (error) throw error;
    periodsRaw = data ?? [];
  } else if (role === 'Spender') {
    const { data, error } = await supabase
      .from('allowances')
      .select('id, allowance_name, amount, start_date, end_date')
      .eq('spender_id', opts.userId);
    if (error) throw error;
    periodsRaw = data ?? [];
  } else {
    fk = 'income_id';
    const { data, error } = await supabase
      .from('income')
      .select('id, source_name, amount, start_date, end_date')
      .eq('user_id', opts.userId);
    if (error) throw error;
    periodsRaw = data ?? [];
  }

  const periods: PeriodRow[] = periodsRaw.map((r) => ({
    id: r.id,
    name: cleanText(r.allowance_name ?? r.source_name ?? '') || 'Untitled',
    label: '',
    amount: toMoney(r.amount),
    start: parseDate(r.start_date),
    end: parseDate(r.end_date),
  }));
  periods.sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) || a.name.localeCompare(b.name));
  labelPeriods(periods);
  const labelById = new Map<string, string>(periods.map((p) => [String(p.id), p.label]));

  const rawExpenses = await fetchExpenses(fk, periods.map((p) => p.id));
  const categoryNames = rawExpenses.some((e) => e.category_id != null) ? await fetchCategoryNames() : new Map<string, string>();
  const categoryByKey = new Map<string, string>(); // case-insensitive grouping ("food" = "Food")
  const txns: TxnRow[] = [];
  for (const e of rawExpenses) {
    const date = new Date(e.spent_at);
    if (isNaN(date.getTime())) continue;
    txns.push({
      id: String(e.id),
      amount: toMoney(e.amount),
      description: cleanText(e.description ?? ''),
      category: canonCategory(rawCategory(e, categoryNames), categoryByKey),
      date,
      periodLabel: labelById.get(String(e[fk])) ?? 'Unassigned',
    });
  }
  txns.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));

  if (periods.length === 0 && txns.length === 0) {
    throw new Error('There is no data to export yet. Add an allowance or income and some expenses first.');
  }

  const generatedAt = new Date();
  const model: ReportModel = {
    role,
    ownerName: owner?.full_name || owner?.email || 'User',
    ownerEmail: owner?.email || '',
    sponsorName: sponsor ? sponsor.full_name || sponsor.email || '' : '',
    periods,
    txns,
    generatedAt,
  };

  const bytes = buildWorkbook(model).build();
  const ownerSlug = sanitizeFileName(model.ownerName);
  const stamp = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}`;
  const fileName = `expense_report_${ownerSlug}_${stamp}.xlsx`;
  const logDetails =
    role === 'Sponsor'
      ? `exported Excel expense report for spender "${model.ownerName}" (${periods.length} allowances, ${txns.length} expenses).`
      : `exported Excel expense report (${periods.length} ${role === 'Personal' ? 'income sources' : 'allowances'}, ${txns.length} expenses).`;

  return { bytes, fileName, logDetails };
}

/* ───────────────────────────── data fetching ───────────────────────────── */

type Role = 'Personal' | 'Spender' | 'Sponsor';
interface Profile { full_name: string | null; email: string | null }
interface PeriodRow { id: string | number; name: string; label: string; amount: number; start: Date | null; end: Date | null }
interface TxnRow { id: string; amount: number; description: string; category: string; date: Date; periodLabel: string }
interface ReportModel {
  role: Role;
  ownerName: string;
  ownerEmail: string;
  sponsorName: string;
  periods: PeriodRow[];
  txns: TxnRow[];
  generatedAt: Date;
}

async function getProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('full_name, email').eq('id', id).single();
  return (data as Profile) ?? null;
}

const UNCATEGORIZED = 'Uncategorized';

/** Category lookup for expenses that only store a category_id. Never throws: a missing table just means "Uncategorized". */
async function fetchCategoryNames(): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.from('categories').select('id, name');
    if (error || !data) return new Map();
    return new Map((data as any[]).map((c) => [String(c.id), String(c.name ?? '')]));
  } catch {
    return new Map();
  }
}

/** Reads the category from an expense row, whichever way the table stores it. */
function rawCategory(e: any, names: Map<string, string>): string {
  const direct = e.category ?? e.category_name ?? e.categories?.name;
  if (typeof direct === 'string' && direct.trim()) return direct;
  if (e.category_id != null && names.has(String(e.category_id))) return names.get(String(e.category_id)) ?? '';
  return '';
}

/** SUMIFS/COUNTIFS are case-insensitive and treat * ? ~ specially, so clean + merge spellings up front. */
function canonCategory(raw: string, seen: Map<string, string>): string {
  const clean = cleanText(raw).slice(0, 40).replace(/[*?~]/g, '-').replace(/^[=<>]+/, '').trim() || UNCATEGORIZED;
  const key = clean.toLowerCase();
  if (!seen.has(key)) seen.set(key, clean.charAt(0).toUpperCase() + clean.slice(1));
  return seen.get(key)!;
}

/** Fetches every expense for the given period ids (chunked + paginated past Supabase's 1000-row cap). */
async function fetchExpenses(fk: 'allowance_id' | 'income_id', ids: (string | number)[]): Promise<any[]> {
  const rows: any[] = [];
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .in(fk, chunk)
        .order('spent_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as any[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const pad = (n: number) => String(n).padStart(2, '0');
const colLetter = (c: number) => String.fromCharCode(64 + c); // 1 -> A (enough for the narrow grids used here)
const round2 = (n: number) => Math.round(n * 100) / 100;
const toMoney = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : 0;
};
const cleanText = (s: string) => String(s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase();

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); // date-only => local, no timezone shift
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const serialDate = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EXCEL_EPOCH) / 86400000);
const serialTime = (d: Date) => (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
const monthSerial = (y: number, m: number) => (Date.UTC(y, m, 1) - EXCEL_EPOCH) / 86400000;
const fmtDate = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const fmtLongDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const money = (n: number) => '₱' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function labelPeriods(periods: PeriodRow[]) {
  const nameCount = new Map<string, number>();
  periods.forEach((p) => nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1));
  const used = new Map<string, number>();
  for (const p of periods) {
    // SUMIFS treats * ? ~ and leading = < > as wildcards / operators, so keep labels free of them.
    let label = p.name.slice(0, 60).replace(/[*?~]/g, '-').replace(/^[=<>]+/, '').trim() || 'Untitled';
    if ((nameCount.get(p.name) ?? 0) > 1 && p.start) {
      label += ` (${fmtDate(p.start)})`;
    }
    const n = (used.get(label) ?? 0) + 1;
    used.set(label, n);
    p.label = n > 1 ? `${label} #${n}` : label;
  }
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2);
}

const rowHeightFor = (text: string, charsPerLine: number, text2 = '', charsPerLine2 = 1) => {
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine), Math.ceil(text2.length / charsPerLine2));
  return 20 + (lines - 1) * 12.5;
};

/* ───────────────────────────── design tokens ───────────────────────────── */
// Change these to re-theme the whole report.

const C = {
  navy: '0B3D2A', // deep forest green (banners, headings)
  blue: '16A34A', // primary brand green (kept as the key name `blue` to limit churn)
  blueSoft: 'DCFCE7', // soft green tint (total rows)
  wash: 'F1F8F4',
  zebra: 'F7FBF8',
  line: 'D5E5DA',
  hair: 'E4EEE7',
  text: '1F2937',
  muted: '6B7280',
  white: 'FFFFFF',
  green: '15803D',
  red: 'DC2626',
  amber: 'B45309',
  teal: '0D9488',
  slate: '94A3B8',
  lime: '65A30D',
  mint: '059669',
};
// Greens first, with warm / teal accents so neighbouring doughnut slices stay distinguishable.
const PALETTE = ['15803D', 'F59E0B', '0D9488', '84CC16', '059669', 'FBBF24', '2DD4BF', '94A3B8'];

const FMT = {
  peso: '"₱"#,##0.00',
  pesoNeg: '"₱"#,##0.00;[Red]-"₱"#,##0.00',
  pesoWhole: '"₱"#,##0',
  date: 'mmm d, yyyy',
  time: 'h:mm AM/PM',
  month: 'mmm yyyy',
  pct: '0.0%',
  pct0: '0%',
  int: '#,##0',
};

const S = {
  title: { bold: true, size: 20, color: C.white, fill: C.navy, indent: 1 } as StyleSpec,
  sub: { size: 10, color: 'BFE3CC', fill: C.navy, indent: 1 } as StyleSpec,
  sub2: { size: 9, color: '8FC5A5', fill: C.navy, indent: 1 } as StyleSpec,
  section: { bold: true, size: 10, color: C.navy, bottom: `medium:${C.blue}` } as StyleSpec,
  th: (h: 'left' | 'center' | 'right' = 'left'): StyleSpec => ({ bold: true, size: 9, color: C.navy, fill: C.wash, bottom: `medium:${C.blue}`, h, wrap: true, indent: h === 'left' ? 1 : 0 }),
  td: (i: number, extra: StyleSpec = {}): StyleSpec => ({ fill: i % 2 ? C.zebra : undefined, bottom: `thin:${C.hair}`, ...extra }),
  totalLabel: { bold: true, color: C.navy, fill: C.blueSoft, top: `thin:${C.blue}`, h: 'right', indent: 1 } as StyleSpec,
  totalNum: (numFmt: string, h: 'right' | 'center' = 'right'): StyleSpec => ({ bold: true, color: C.navy, fill: C.blueSoft, top: `thin:${C.blue}`, numFmt, h }),
};

/** Navy banner at the top of a sheet. */
function banner(sheet: Sheet, lastCol: number, title: string, lines: string[]) {
  sheet.width(1, 2.5);
  sheet.height(1, 10);
  sheet.height(2, 42);
  sheet.merge(2, 2, 2, lastCol, title, S.title);
  lines.forEach((line, i) => {
    sheet.height(3 + i, 20);
    sheet.merge(3 + i, 2, 3 + i, lastCol, line, i === 0 ? S.sub : S.sub2);
  });
}

/* ───────────────────────────── workbook ───────────────────────────── */

function buildWorkbook(m: ReportModel): Workbook {
  const isPersonal = m.role === 'Personal';
  const periodWord = isPersonal ? 'Income Source' : 'Allowance';
  const periodsTitle = isPersonal ? 'Income Periods' : 'Allowance Periods';
  const budgetWord = isPersonal ? 'Income' : 'Allocated';
  const SHEET = { summary: 'Summary', monthly: 'Monthly Expenses', periods: periodsTitle, categories: 'Categories', ledger: 'All Transactions' };

  const wb = new Workbook();
  wb.title = `Expense Report – ${m.ownerName}`;
  wb.creator = 'Expense Tracker';
  const sSummary = wb.addSheet(SHEET.summary, C.blue);
  const sMonthly = wb.addSheet(SHEET.monthly, C.teal);
  const sPeriods = wb.addSheet(SHEET.periods, C.lime);
  const sCategories = wb.addSheet(SHEET.categories, C.mint);
  const sLedger = wb.addSheet(SHEET.ledger, C.slate);

  const n = m.txns.length;
  const p = m.periods.length;
  const totalSpent = round2(m.txns.reduce((s, t) => s + t.amount, 0));
  const totalBudget = round2(m.periods.reduce((s, x) => s + x.amount, 0));

  // Header text shared by every sheet
  const first = n ? m.txns[0].date : m.periods[0]?.start ?? m.generatedAt;
  const last = n ? m.txns[n - 1].date : m.periods[p - 1]?.end ?? m.generatedAt;
  const preparedFor = m.role === 'Sponsor'
    ? `Spender: ${m.ownerName}${m.ownerEmail ? `  ·  ${m.ownerEmail}` : ''}`
    : `Prepared for ${m.ownerName}${m.ownerEmail ? `  ·  ${m.ownerEmail}` : ''}`;
  const metaLine =
    `${m.role === 'Sponsor' && m.sponsorName ? `Sponsor: ${m.sponsorName}  ·  ` : `Role: ${m.role}  ·  `}` +
    `Generated ${fmtLongDate(m.generatedAt)}  ·  Coverage ${fmtLongDate(first)} – ${fmtLongDate(last)}`;

  /* ───────── 4. All Transactions (built first: every other sheet points at it) ───────── */
  const L0 = 6; // first ledger data row
  const LN = Math.max(L0, 5 + n); // last ledger data row (kept valid even when empty)
  const dateRange = sheetRange(SHEET.ledger, L0, 3, LN, 3);
  const categoryRange = sheetRange(SHEET.ledger, L0, 6, LN, 6);
  const periodRange = sheetRange(SHEET.ledger, L0, 7, LN, 7);
  const monthRange = sheetRange(SHEET.ledger, L0, 8, LN, 8);
  const amountRange = sheetRange(SHEET.ledger, L0, 9, LN, 9);

  banner(sLedger, 9, 'All Transactions', [`${preparedFor}`, `${n} transaction${n === 1 ? '' : 's'}  ·  Use the filter arrows in the header row to slice the data`]);
  [6, 16, 11, 40, 20, 32, 12, 16].forEach((w, i) => sLedger.width(i + 2, w));
  sLedger.height(5, 26);
  ['No.', 'Date', 'Time', 'Description', 'Category', periodWord === 'Allowance' ? 'Allowance Period' : 'Income Source', 'Month', 'Amount'].forEach((h, i) =>
    sLedger.set(5, i + 2, h, S.th(i === 0 ? 'center' : i === 7 ? 'right' : 'left')),
  );
  m.txns.forEach((t, i) => {
    const r = L0 + i;
    sLedger.height(r, rowHeightFor(t.description, 46, t.periodLabel, 36));
    sLedger.set(r, 2, i + 1, S.td(i, { h: 'center', color: C.muted, size: 9 }));
    sLedger.set(r, 3, serialDate(t.date), S.td(i, { numFmt: FMT.date, h: 'left', indent: 1 }));
    sLedger.set(r, 4, serialTime(t.date), S.td(i, { numFmt: FMT.time, h: 'left', color: C.muted }));
    sLedger.set(r, 5, t.description || '—', S.td(i, { wrap: true, indent: 1 }));
    sLedger.set(r, 6, t.category, S.td(i, { wrap: true, indent: 1 }));
    sLedger.set(r, 7, t.periodLabel, S.td(i, { wrap: true, color: C.muted, indent: 1 }));
    sLedger.set(r, 8, monthSerial(t.date.getFullYear(), t.date.getMonth()), S.td(i, { numFmt: FMT.month, h: 'left', color: C.muted }));
    sLedger.set(r, 9, t.amount, S.td(i, { numFmt: FMT.peso, h: 'right', bold: true }));
  });
  if (n) {
    const tr = LN + 1;
    sLedger.height(tr, 24);
    sLedger.merge(tr, 2, tr, 8, 'TOTAL (follows the active filter)', S.totalLabel);
    sLedger.set(tr, 9, totalSpent, S.totalNum(FMT.peso), `SUBTOTAL(109,I${L0}:I${LN})`);
    sLedger.autoFilter = `B5:I${LN}`;
  } else {
    sLedger.merge(L0, 2, L0, 9, 'No expenses have been recorded yet.', { italic: true, color: C.muted, h: 'center' });
  }
  sLedger.freezeRow = L0;

  /* ───────── 3. Allowance / Income Periods ───────── */
  banner(sPeriods, 11, periodsTitle, [preparedFor, `${p} ${isPersonal ? 'income source' : 'allowance period'}${p === 1 ? '' : 's'}  ·  Spent amounts are calculated from the “All Transactions” sheet`]);
  [6, 38, 15, 15, 16, 16, 16, 14, 13, 13].forEach((w, i) => sPeriods.width(i + 2, w));
  sPeriods.height(5, 30);
  const periodHeaders = ['No.', periodWord === 'Allowance' ? 'Allowance Period' : 'Income Source', 'Start Date', 'End Date', budgetWord, 'Spent', 'Remaining', '% Used', 'Transactions', 'Status'];
  periodHeaders.forEach((h, i) => {
    const align = i === 0 || i === 7 || i === 8 || i === 9 ? 'center' : i >= 4 ? 'right' : 'left';
    sPeriods.set(5, i + 2, h, S.th(align));
  });

  const P0 = 6;
  const PT = P0 + p; // total row
  const today = serialDate(m.generatedAt);
  const spentBy = new Map<string, number>();
  const countBy = new Map<string, number>();
  m.txns.forEach((t) => {
    spentBy.set(t.periodLabel, round2((spentBy.get(t.periodLabel) ?? 0) + t.amount));
    countBy.set(t.periodLabel, (countBy.get(t.periodLabel) ?? 0) + 1);
  });
  const periodRows = m.periods.map((x, i) => ({ ...x, row: P0 + i, spent: spentBy.get(x.label) ?? 0, count: countBy.get(x.label) ?? 0 }));

  periodRows.forEach((x, i) => {
    const r = x.row;
    sPeriods.height(r, rowHeightFor(x.label, 36));
    const remaining = round2(x.amount - x.spent);
    const status = x.start && serialDate(x.start) > today ? 'Upcoming' : x.end && serialDate(x.end) < today ? 'Completed' : 'Active';
    const statusColor = status === 'Active' ? C.green : status === 'Upcoming' ? C.teal : C.muted;
    sPeriods.set(r, 2, i + 1, S.td(i, { h: 'center', color: C.muted, size: 9 }));
    sPeriods.set(r, 3, x.label, S.td(i, { bold: true, wrap: true, indent: 1 }));
    sPeriods.set(r, 4, x.start ? serialDate(x.start) : '—', S.td(i, { numFmt: FMT.date, h: 'left' }));
    sPeriods.set(r, 5, x.end ? serialDate(x.end) : 'Ongoing', S.td(i, { numFmt: FMT.date, h: 'left' }));
    sPeriods.set(r, 6, x.amount, S.td(i, { numFmt: FMT.peso, h: 'right' }));
    sPeriods.set(r, 7, x.spent, S.td(i, { numFmt: FMT.peso, h: 'right' }), `SUMIFS(${amountRange},${periodRange},C${r})`);
    sPeriods.set(r, 8, remaining, S.td(i, { numFmt: FMT.pesoNeg, h: 'right', bold: true }), `F${r}-G${r}`);
    sPeriods.set(r, 9, x.amount ? x.spent / x.amount : 0, S.td(i, { numFmt: FMT.pct, h: 'center' }), `IF(F${r}=0,0,G${r}/F${r})`);
    sPeriods.set(r, 10, x.count, S.td(i, { numFmt: FMT.int, h: 'center' }), `COUNTIFS(${periodRange},C${r})`);
    sPeriods.set(r, 11, status, S.td(i, { h: 'center', bold: true, color: statusColor, size: 9 }));
  });

  if (p) {
    sPeriods.height(PT, 26);
    sPeriods.merge(PT, 2, PT, 5, 'TOTAL', S.totalLabel);
    sPeriods.set(PT, 6, totalBudget, S.totalNum(FMT.peso), `SUM(F${P0}:F${PT - 1})`);
    sPeriods.set(PT, 7, totalSpent, S.totalNum(FMT.peso), `SUM(G${P0}:G${PT - 1})`);
    sPeriods.set(PT, 8, round2(totalBudget - totalSpent), S.totalNum(FMT.pesoNeg), `F${PT}-G${PT}`);
    sPeriods.set(PT, 9, totalBudget ? totalSpent / totalBudget : 0, S.totalNum(FMT.pct, 'center'), `IF(F${PT}=0,0,G${PT}/F${PT})`);
    sPeriods.set(PT, 10, n, S.totalNum(FMT.int, 'center'), `SUM(J${P0}:J${PT - 1})`);
    sPeriods.set(PT, 11, null, S.totalNum('General'));
    sPeriods.dataBar(`I${P0}:I${PT - 1}`, '86EFAC');
    sPeriods.highlightAbove(`I${P0}:I${PT - 1}`, 1);

    const shown = periodRows.slice(-10); // most recent 10 periods in the charts
    const r1 = shown[0].row;
    const r2 = shown[shown.length - 1].row;
    const chartTop = PT + 2; // zero-based row index => leaves one blank row after the total
    const shownNote = periodRows.length > 10 ? ' (latest 10)' : '';
    const cats = shown.map((x) => x.label);
    const c1: ChartSpec = {
      kind: 'column',
      title: `${budgetWord} vs. Spent${shownNote}`,
      from: { col: 1, row: chartTop },
      to: { col: 6, row: chartTop + 17 },
      legend: true,
      valFormat: FMT.pesoWhole,
      series: [
        { name: budgetWord, nameRef: `${quoteSheet(SHEET.periods)}!$F$5`, catRef: sheetRange(SHEET.periods, r1, 3, r2, 3), valRef: sheetRange(SHEET.periods, r1, 6, r2, 6), cats, vals: shown.map((x) => x.amount), color: C.slate },
        { name: 'Spent', nameRef: `${quoteSheet(SHEET.periods)}!$G$5`, catRef: sheetRange(SHEET.periods, r1, 3, r2, 3), valRef: sheetRange(SHEET.periods, r1, 7, r2, 7), cats, vals: shown.map((x) => x.spent), color: C.blue },
      ],
    };
    const c2: ChartSpec = {
      kind: 'bar',
      title: `${isPersonal ? 'Income' : 'Budget'} Used (%)${shownNote}`,
      from: { col: 6, row: chartTop, dx: 114300 },
      to: { col: 11, row: chartTop + 17 },
      legend: false,
      showValues: true,
      valFormat: FMT.pct0,
      series: [
        { name: '% Used', nameRef: `${quoteSheet(SHEET.periods)}!$I$5`, catRef: sheetRange(SHEET.periods, r1, 3, r2, 3), valRef: sheetRange(SHEET.periods, r1, 9, r2, 9), cats, vals: shown.map((x) => (x.amount ? x.spent / x.amount : 0)), color: C.teal },
      ],
    };
    sPeriods.charts.push(c1, c2);
  } else {
    sPeriods.merge(P0, 2, P0, 11, `No ${isPersonal ? 'income sources' : 'allowance periods'} found.`, { italic: true, color: C.muted, h: 'center' });
  }
  sPeriods.freezeRow = 6;

  /* ───────── 2. Monthly Expenses ───────── */
  const byMonth = new Map<number, TxnRow[]>();
  m.txns.forEach((t) => {
    const key = t.date.getFullYear() * 12 + t.date.getMonth();
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(t);
  });
  const monthKeys = Array.from(byMonth.keys()).sort((a, b) => a - b);

  banner(sMonthly, 8, 'Monthly Expenses', [preparedFor, `${monthKeys.length} month${monthKeys.length === 1 ? '' : 's'} with activity  ·  ${n} transaction${n === 1 ? '' : 's'}  ·  Total spent ${money(totalSpent)}`]);
  [6, 16, 11, 38, 20, 32, 16].forEach((w, i) => sMonthly.width(i + 2, w));
  sMonthly.freezeRow = 4;

  sMonthly.height(5, 12);
  let row = 6;
  const monthTotalCells: string[] = [];
  if (!monthKeys.length) {
    sMonthly.merge(row, 2, row, 8, 'No expenses have been recorded yet.', { italic: true, color: C.muted, h: 'center' });
  }
  monthKeys.forEach((key) => {
    const list = byMonth.get(key)!;
    const year = Math.floor(key / 12);
    const month = key % 12;
    const label = `${MONTHS[month]} ${year}`;
    const subtotal = round2(list.reduce((s, t) => s + t.amount, 0));

    sMonthly.height(row, 28);
    sMonthly.merge(row, 2, row, 6, label.toUpperCase(), { bold: true, size: 11, color: C.white, fill: C.blue, indent: 1 });
    sMonthly.merge(row, 7, row, 8, `${list.length} transaction${list.length === 1 ? '' : 's'}`, { size: 9, color: 'DCFCE7', fill: C.blue, h: 'right', indent: 1 });
    row++;

    sMonthly.height(row, 24);
    ['No.', 'Date', 'Time', 'Description', 'Category', periodWord === 'Allowance' ? 'Allowance Period' : 'Income Source', 'Amount'].forEach((h, i) =>
      sMonthly.set(row, i + 2, h, S.th(i === 0 ? 'center' : i === 6 ? 'right' : 'left')),
    );
    row++;

    const firstRow = row;
    list.forEach((t, i) => {
      sMonthly.height(row, rowHeightFor(t.description, 44, t.periodLabel, 36));
      sMonthly.set(row, 2, i + 1, S.td(i, { h: 'center', color: C.muted, size: 9 }));
      sMonthly.set(row, 3, serialDate(t.date), S.td(i, { numFmt: FMT.date, h: 'left', indent: 1 }));
      sMonthly.set(row, 4, serialTime(t.date), S.td(i, { numFmt: FMT.time, h: 'left', color: C.muted }));
      sMonthly.set(row, 5, t.description || '—', S.td(i, { wrap: true, indent: 1 }));
      sMonthly.set(row, 6, t.category, S.td(i, { wrap: true, indent: 1 }));
      sMonthly.set(row, 7, t.periodLabel, S.td(i, { wrap: true, color: C.muted, indent: 1 }));
      sMonthly.set(row, 8, t.amount, S.td(i, { numFmt: FMT.peso, h: 'right', bold: true }));
      row++;
    });

    sMonthly.height(row, 26);
    sMonthly.merge(row, 2, row, 7, `Total for ${label}`, S.totalLabel);
    sMonthly.set(row, 8, subtotal, S.totalNum(FMT.peso), `SUM(H${firstRow}:H${row - 1})`);
    monthTotalCells.push(`H${row}`);
    row += 1;
    sMonthly.height(row, 16);
    row += 1;
  });
  if (monthKeys.length) {
    sMonthly.height(row, 30);
    sMonthly.merge(row, 2, row, 7, 'GRAND TOTAL — ALL MONTHS', { bold: true, size: 11, color: C.white, fill: C.navy, h: 'right', indent: 1 });
    sMonthly.set(row, 8, totalSpent, { bold: true, size: 11, color: C.white, fill: C.navy, numFmt: FMT.peso, h: 'right' }, `SUM(${monthTotalCells.join(',')})`);
  }


  /* ───────── 4. Categories ───────── */
  {
    const catMap = new Map<string, { name: string; count: number; spent: number; largest: number; last: Date }>();
    m.txns.forEach((t) => {
      const c = catMap.get(t.category) ?? { name: t.category, count: 0, spent: 0, largest: 0, last: t.date };
      c.count += 1;
      c.spent = round2(c.spent + t.amount);
      c.largest = Math.max(c.largest, t.amount);
      if (t.date > c.last) c.last = t.date;
      catMap.set(t.category, c);
    });
    const cats = Array.from(catMap.values()).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
    const k = cats.length;
    const topName = cats[0]?.name ?? '—';

    banner(sCategories, 9, 'Spending by Category', [
      preparedFor,
      k
        ? `${k} categor${k === 1 ? 'y' : 'ies'}  ·  Top category: ${topName} (${money(cats[0].spent)})  ·  Figures are calculated from the “All Transactions” sheet`
        : 'No expenses have been recorded yet.',
    ]);
    [6, 28, 14, 16, 12, 16, 16, 14].forEach((w, i) => sCategories.width(i + 2, w));
    sCategories.freezeRow = 5;

    if (!k) {
      sCategories.merge(6, 2, 6, 9, 'No expenses have been recorded yet.', { italic: true, color: C.muted, h: 'center' });
    } else {
      sCategories.height(5, 30);
      ['Rank', 'Category', 'Transactions', 'Spent', '% of Total', 'Avg per Txn', 'Largest', 'Last Spent'].forEach((h, i) =>
        sCategories.set(5, i + 2, h, S.th(i === 0 ? 'center' : i === 1 ? 'left' : i === 7 ? 'center' : 'right')),
      );
      const K0 = 6;
      const KT = K0 + k; // total row
      cats.forEach((c, i) => {
        const r = K0 + i;
        sCategories.height(r, 22);
        sCategories.set(r, 2, i + 1, S.td(i, { h: 'center', color: C.muted, size: 9 }));
        sCategories.set(r, 3, c.name, S.td(i, { bold: true, indent: 1 }));
        sCategories.set(r, 4, c.count, S.td(i, { numFmt: FMT.int, h: 'right' }), `COUNTIFS(${categoryRange},C${r})`);
        sCategories.set(r, 5, c.spent, S.td(i, { numFmt: FMT.peso, h: 'right', bold: true }), `SUMIFS(${amountRange},${categoryRange},C${r})`);
        sCategories.set(r, 6, totalSpent ? c.spent / totalSpent : 0, S.td(i, { numFmt: FMT.pct, h: 'right' }), `IF($E$${KT}=0,0,E${r}/$E$${KT})`);
        sCategories.set(r, 7, c.count ? round2(c.spent / c.count) : 0, S.td(i, { numFmt: FMT.peso, h: 'right' }), `IF(D${r}=0,0,E${r}/D${r})`);
        sCategories.set(r, 8, c.largest, S.td(i, { numFmt: FMT.peso, h: 'right' }), `_xlfn.MAXIFS(${amountRange},${categoryRange},C${r})`);
        sCategories.set(r, 9, serialDate(c.last), S.td(i, { numFmt: FMT.date, h: 'center', color: C.muted }), `_xlfn.MAXIFS(${dateRange},${categoryRange},C${r})`);
      });
      sCategories.height(KT, 26);
      sCategories.set(KT, 2, null, S.totalLabel);
      sCategories.set(KT, 3, 'TOTAL', { ...S.totalLabel, h: 'left' });
      sCategories.set(KT, 4, n, S.totalNum(FMT.int), `SUM(D${K0}:D${KT - 1})`);
      sCategories.set(KT, 5, totalSpent, S.totalNum(FMT.peso), `SUM(E${K0}:E${KT - 1})`);
      sCategories.set(KT, 6, 1, S.totalNum(FMT.pct), `SUM(F${K0}:F${KT - 1})`);
      sCategories.set(KT, 7, n ? round2(totalSpent / n) : 0, S.totalNum(FMT.peso), `IF(D${KT}=0,0,E${KT}/D${KT})`);
      sCategories.set(KT, 8, Math.max(...cats.map((c) => c.largest)), S.totalNum(FMT.peso), `MAX(H${K0}:H${KT - 1})`);
      sCategories.set(KT, 9, null, S.totalNum('General'));
      sCategories.dataBar(`F${K0}:F${KT - 1}`, '86EFAC');

      // Charts (top 8 categories) -------------------------------------------
      const shown = cats.slice(0, 8);
      const kLast = K0 + shown.length - 1;
      const note = k > 8 ? ' (top 8)' : '';
      const catName = quoteSheet(SHEET.categories);
      const chartTop = KT + 1; // zero-based => one blank row after the total
      const names = shown.map((c) => c.name);
      sCategories.charts.push(
        {
          kind: 'doughnut',
          title: `Share of Spending by Category${note}`,
          from: { col: 1, row: chartTop },
          to: { col: 5, row: chartTop + 17 },
          legend: true,
          sliceColors: PALETTE,
          series: [
            { name: 'Spent', nameRef: `${catName}!$E$5`, catRef: sheetRange(SHEET.categories, K0, 3, kLast, 3), valRef: sheetRange(SHEET.categories, K0, 5, kLast, 5), cats: names, vals: shown.map((c) => c.spent), color: C.blue },
          ],
        },
        {
          kind: 'bar',
          title: `Amount Spent by Category${note}`,
          from: { col: 5, row: chartTop, dx: 114300 },
          to: { col: 9, row: chartTop + 17 },
          legend: false,
          showValues: true,
          valFormat: FMT.pesoWhole,
          series: [
            { name: 'Spent', nameRef: `${catName}!$E$5`, catRef: sheetRange(SHEET.categories, K0, 3, kLast, 3), valRef: sheetRange(SHEET.categories, K0, 5, kLast, 5), cats: names, vals: shown.map((c) => c.spent), color: C.blue },
          ],
        },
      );

      // Category × month grid (latest 6 months, top 8 categories) ---------------
      const lastKey = monthKeys[monthKeys.length - 1];
      const firstKey = Math.max(monthKeys[0], lastKey - 5);
      const gridMonths: number[] = [];
      for (let key = firstKey; key <= lastKey; key++) gridMonths.push(key);
      const G0 = chartTop + 21; // section title row (1-based), below the charts
      sCategories.height(G0, 26);
      sCategories.merge(G0, 2, G0, 9, `CATEGORY BY MONTH${monthKeys.length > 6 ? ' (latest 6 months)' : ''}${note ? ' · top 8 categories' : ''}`, S.section);
      sCategories.height(G0 + 1, 26);
      sCategories.set(G0 + 1, 2, null, S.th('center'));
      sCategories.set(G0 + 1, 3, 'Category', S.th('left'));
      gridMonths.forEach((key, j) =>
        sCategories.set(G0 + 1, 4 + j, monthSerial(Math.floor(key / 12), key % 12), { ...S.th('right'), numFmt: FMT.month }),
      );
      shown.forEach((c, i) => {
        const r = G0 + 2 + i;
        sCategories.height(r, 20);
        sCategories.set(r, 2, i + 1, S.td(i, { h: 'center', color: C.muted, size: 9 }));
        sCategories.set(r, 3, c.name, S.td(i, { bold: true, indent: 1 }), `C${K0 + i}`);
        gridMonths.forEach((key, j) => {
          const list = (byMonth.get(key) ?? []).filter((t) => t.category === c.name);
          const v = round2(list.reduce((s2, t) => s2 + t.amount, 0));
          const col = colLetter(4 + j);
          sCategories.set(r, 4 + j, v, S.td(i, { numFmt: FMT.peso, h: 'right', color: v ? C.text : C.muted }), `SUMIFS(${amountRange},${categoryRange},$C${r},${monthRange},${col}$${G0 + 1})`);
        });
      });
    }
  }

  /* ───────── 1. Summary ───────── */
  sSummary.landscape = false;
  sSummary.fitToHeight = 1;
  banner(sSummary, 13, 'Expense Report', [preparedFor, metaLine]);
  sSummary.width(1, 2.5);
  for (let c = 2; c <= 13; c++) sSummary.width(c, 13);

  // Monthly series (every calendar month between the first and last expense, gaps = ₱0)
  const months: { serial: number; label: string; spent: number; count: number }[] = [];
  if (monthKeys.length) {
    for (let k = monthKeys[0]; k <= monthKeys[monthKeys.length - 1]; k++) {
      const list = byMonth.get(k) ?? [];
      months.push({
        serial: monthSerial(Math.floor(k / 12), k % 12),
        label: `${MON[k % 12]} ${Math.floor(k / 12)}`,
        spent: round2(list.reduce((s, t) => s + t.amount, 0)),
        count: list.length,
      });
    }
  }
  const T0 = 35; // first data row of both summary tables
  const TN = T0 + months.length - 1; // last month row
  const TT = TN + 1; // monthly total row
  const monthSpent = sheetRange(SHEET.summary, T0, 4, Math.max(TN, T0), 4);

  // KPI cards ------------------------------------------------------------
  const largest = m.txns.reduce((best, t) => (t.amount > (best?.amount ?? -1) ? t : best), null as TxnRow | null);
  const peak = months.reduce((best, x) => (x.spent > (best?.spent ?? -1) ? x : best), null as (typeof months)[number] | null);
  const avgPerTxn = n ? round2(totalSpent / n) : 0;
  const avgPerMonth = months.length ? round2(totalSpent / months.length) : 0;
  const PT_REF = quoteSheet(SHEET.periods);
  const hasPeriods = p > 0;

  type Kpi = { label: string; value: number; f?: string; fmt: string; note: string };
  const kpiRow1: Kpi[] = [
    { label: `TOTAL ${budgetWord.toUpperCase()}`, value: totalBudget, f: hasPeriods ? `${PT_REF}!F${PT}` : undefined, fmt: FMT.peso, note: `${p} ${isPersonal ? 'income source' : 'allowance period'}${p === 1 ? '' : 's'}` },
    { label: 'TOTAL SPENT', value: totalSpent, f: hasPeriods ? `${PT_REF}!G${PT}` : `SUM(${amountRange})`, fmt: FMT.peso, note: totalBudget ? `${((totalSpent / totalBudget) * 100).toFixed(1)}% of ${budgetWord.toLowerCase()}` : 'No budget recorded' },
    { label: 'REMAINING BALANCE', value: round2(totalBudget - totalSpent), f: hasPeriods ? `${PT_REF}!H${PT}` : undefined, fmt: FMT.pesoNeg, note: totalBudget - totalSpent >= 0 ? 'Still available to spend' : 'Spending is over budget' },
    { label: 'TRANSACTIONS', value: n, f: `COUNT(${amountRange})`, fmt: FMT.int, note: `${months.length} month${months.length === 1 ? '' : 's'} of activity` },
  ];
  const kpiRow2: Kpi[] = [
    { label: 'LARGEST EXPENSE', value: largest?.amount ?? 0, f: n ? `MAX(${amountRange})` : undefined, fmt: FMT.peso, note: largest ? (largest.description || 'No description').slice(0, 30) : '—' },
    { label: 'HIGHEST SPENDING MONTH', value: peak?.spent ?? 0, f: months.length ? `MAX(${monthSpent})` : undefined, fmt: FMT.peso, note: peak ? peak.label : '—' },
    { label: 'MONTHLY AVERAGE', value: avgPerMonth, f: months.length ? `AVERAGE(${monthSpent})` : undefined, fmt: FMT.peso, note: `Across ${months.length} month${months.length === 1 ? '' : 's'}` },
    { label: 'AVERAGE PER TRANSACTION', value: avgPerTxn, f: n ? `AVERAGE(${amountRange})` : undefined, fmt: FMT.peso, note: n ? `Median ${money(median(m.txns.map((t) => t.amount)))}` : '—' },
  ];

  const drawKpis = (startRow: number, items: Kpi[]) => {
    sSummary.height(startRow, 22);
    sSummary.height(startRow + 1, 36);
    sSummary.height(startRow + 2, 22);
    items.forEach((k, i) => {
      const c1 = 2 + i * 3;
      const c2 = c1 + 2;
      const edge = { left: `thick:${C.blue}` };
      const gap = { right: `thick:${C.white}` };
      sSummary.merge(startRow, c1, startRow, c2, k.label, { bold: true, size: 8, color: C.muted, fill: C.wash, indent: 1, v: 'bottom', ...edge, ...gap });
      sSummary.merge(startRow + 1, c1, startRow + 1, c2, k.value, { bold: true, size: 16, color: C.navy, fill: C.wash, indent: 1, numFmt: k.fmt, h: 'left', ...edge, ...gap }, k.f);
      sSummary.merge(startRow + 2, c1, startRow + 2, c2, k.note, { size: 8, color: C.muted, fill: C.wash, indent: 1, v: 'top', ...edge, ...gap });
    });
  };
  drawKpis(6, kpiRow1);
  drawKpis(10, kpiRow2);

  sSummary.height(14, 26);
  sSummary.merge(14, 2, 14, 13, 'SPENDING OVERVIEW', S.section);

  if (!n) {
    sSummary.height(16, 40);
    sSummary.merge(16, 2, 16, 13, 'No expenses have been recorded yet. Charts and monthly breakdowns will appear here once expenses are added.', { italic: true, color: C.muted, h: 'center', wrap: true });
  } else {
    // Monthly trend table ---------------------------------------------------
    sSummary.height(33, 26);
    sSummary.merge(33, 2, 33, 6, 'MONTHLY TREND', S.section);
    sSummary.height(34, 30);
    ['Month', 'Transactions', 'Spent', '% of Total', 'vs. Prev Month'].forEach((h, i) => sSummary.set(34, 2 + i, h, S.th(i === 0 ? 'left' : 'right')));
    months.forEach((x, i) => {
      const r = T0 + i;
      sSummary.height(r, 20);
      sSummary.set(r, 2, x.serial, S.td(i, { numFmt: FMT.month, h: 'left', bold: true, indent: 1 }));
      sSummary.set(r, 3, x.count, S.td(i, { numFmt: FMT.int, h: 'right' }), `COUNTIFS(${monthRange},B${r})`);
      sSummary.set(r, 4, x.spent, S.td(i, { numFmt: FMT.peso, h: 'right' }), `SUMIFS(${amountRange},${monthRange},B${r})`);
      sSummary.set(r, 5, totalSpent ? x.spent / totalSpent : 0, S.td(i, { numFmt: FMT.pct, h: 'right' }), `IF($D$${TT}=0,0,D${r}/$D$${TT})`);
      if (i === 0) {
        sSummary.set(r, 6, '–', S.td(i, { h: 'right', color: C.muted }));
      } else {
        const prev = months[i - 1].spent;
        const val: string | number = prev === 0 ? '–' : (x.spent - prev) / prev;
        sSummary.set(r, 6, val, S.td(i, { numFmt: '+0.0%;-0.0%;0.0%', h: 'right', color: C.muted }), `IF(D${r - 1}=0,"–",D${r}/D${r - 1}-1)`);
      }
    });
    sSummary.height(TT, 24);
    sSummary.set(TT, 2, 'Total', { ...S.totalLabel, h: 'left' });
    sSummary.set(TT, 3, n, S.totalNum(FMT.int), `SUM(C${T0}:C${TN})`);
    sSummary.set(TT, 4, totalSpent, S.totalNum(FMT.peso), `SUM(D${T0}:D${TN})`);
    sSummary.set(TT, 5, 1, S.totalNum(FMT.pct), `SUM(E${T0}:E${TN})`);
    sSummary.set(TT, 6, null, S.totalNum('General'));

    // Top periods table -----------------------------------------------------
    sSummary.merge(33, 8, 33, 13, `TOP ${isPersonal ? 'INCOME SOURCES' : 'ALLOWANCE PERIODS'} BY SPENDING`, S.section);
    sSummary.set(34, 8, 'Rank', S.th('center'));
    sSummary.merge(34, 9, 34, 11, periodWord === 'Allowance' ? 'Allowance Period' : 'Income Source', S.th('left'));
    sSummary.set(34, 12, 'Spent', S.th('right'));
    sSummary.set(34, 13, 'Share', S.th('right'));

    const ranked = periodRows.filter((x) => x.spent > 0).sort((a, b) => b.spent - a.spent);
    const top = ranked.slice(0, 6);
    const rest = ranked.slice(6);
    const rows: { label: string; value: number; f: string }[] = top.map((x) => ({ label: x.label, value: x.spent, f: `${PT_REF}!G${x.row}` }));
    const restTotal = round2(rest.reduce((s, x) => s + x.spent, 0));
    if (rest.length) {
      rows.push({ label: `All other (${rest.length})`, value: restTotal, f: `${PT_REF}!$G$${PT}-SUM(L${T0}:L${T0 + top.length - 1})` });
    }
    rows.forEach((x, i) => {
      const r = T0 + i;
      sSummary.set(r, 8, i + 1, S.td(i, { h: 'center', color: C.muted, size: 9 }));
      sSummary.merge(r, 9, r, 11, x.label, S.td(i, { bold: true, indent: 1 }));
      sSummary.set(r, 12, x.value, S.td(i, { numFmt: FMT.peso, h: 'right' }), x.f);
      sSummary.set(r, 13, totalSpent ? x.value / totalSpent : 0, S.td(i, { numFmt: FMT.pct, h: 'right' }), `IF(${PT_REF}!$G$${PT}=0,0,L${r}/${PT_REF}!$G$${PT})`);
    });

    // Charts ------------------------------------------------------------------
    const shownMonths = months.slice(-12);
    const mStart = T0 + months.length - shownMonths.length;
    const sumName = quoteSheet(SHEET.summary);
    sSummary.charts.push({
      kind: 'column',
      title: months.length > 12 ? 'Monthly Spending (last 12 months)' : 'Monthly Spending',
      from: { col: 1, row: 14 },
      to: { col: 7, row: 31 },
      legend: false,
      showValues: true,
      catIsNumeric: true,
      catFormat: FMT.month,
      valFormat: FMT.pesoWhole,
      series: [
        { name: 'Spent', nameRef: `${sumName}!$D$34`, catRef: sheetRange(SHEET.summary, mStart, 2, TN, 2), valRef: sheetRange(SHEET.summary, mStart, 4, TN, 4), cats: shownMonths.map((x) => x.serial), vals: shownMonths.map((x) => x.spent), color: C.blue },
      ],
    });
    if (rows.length) {
      const last = T0 + rows.length - 1;
      sSummary.charts.push({
        kind: 'doughnut',
        title: `Spending by ${isPersonal ? 'Income Source' : 'Allowance Period'}`,
        from: { col: 7, row: 14, dx: 114300 },
        to: { col: 13, row: 31 },
        legend: true,
        sliceColors: PALETTE,
        series: [
          { name: 'Spent', nameRef: `${sumName}!$L$34`, catRef: sheetRange(SHEET.summary, T0, 9, last, 9), valRef: sheetRange(SHEET.summary, T0, 12, last, 12), cats: rows.map((x) => x.label), vals: rows.map((x) => x.value), color: C.blue },
        ],
      });
    }
  }

  // Footnote
  const noteRow = Math.max(n ? TT : 33, n ? T0 + 7 : 33) + 2;
  sSummary.height(noteRow, 44);
  sSummary.merge(
    noteRow,
    2,
    noteRow,
    13,
    `Notes: Amounts are in Philippine Peso (₱). Dates and times use the time zone of the device that created this report. ` +
      `${budgetWord} amounts come from your ${isPersonal ? 'income' : 'allowance'} records; spending figures are formulas based on the “All Transactions” sheet and update if you edit it.`,
    { italic: true, size: 8, color: C.muted, wrap: true, v: 'top', top: `thin:${C.line}` },
  );

  return wb;
}
