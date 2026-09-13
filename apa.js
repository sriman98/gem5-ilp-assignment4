// apa.js -- shared docx-js helpers for APA 7 (student paper) reports:
// US Letter, 1" margins, Times New Roman 12, double spacing, page numbers.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
        AlignmentType, HeadingLevel, BorderStyle, ShadingType, Header, PageNumber, LevelFormat } = require('docx');

const FONT = 'Times New Roman', MONO = 'Courier New', DS = 480, CONTENT_W = 9360;

function tr(text, o = {}) {
  return new TextRun({ text, bold: !!o.b, italics: !!o.i, font: o.mono ? MONO : FONT,
                       size: o.size || (o.mono ? 20 : 24), superScript: !!o.sup });
}
function runs(spec) {
  if (typeof spec === 'string') return [tr(spec)];
  return spec.map(s => typeof s === 'string' ? tr(s) : tr(s.t, s));
}
// body paragraph: double-spaced, first-line indent 0.5"
function P(spec, o = {}) {
  return new Paragraph({
    children: runs(spec),
    alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { line: o.single ? 240 : DS, before: 0, after: o.after || 0 },
    indent: o.noindent ? undefined : { firstLine: 720 },
    keepNext: !!o.keepNext, pageBreakBefore: !!o.pageBreak,
  });
}
function H1(t, o = {}) {           // Level 1: centered, bold
  return new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, keepNext: true,
    pageBreakBefore: !!o.pageBreak, spacing: { line: DS, before: 0, after: 0 }, children: [tr(t, { b: true })] });
}
function H2(t) {                   // Level 2: flush left, bold
  return new Paragraph({ heading: HeadingLevel.HEADING_2, alignment: AlignmentType.LEFT, keepNext: true,
    spacing: { line: DS, before: 0, after: 0 }, children: [tr(t, { b: true })] });
}
function H3(t) {                   // Level 3: flush left, bold italic
  return new Paragraph({ heading: HeadingLevel.HEADING_3, alignment: AlignmentType.LEFT, keepNext: true,
    spacing: { line: DS, before: 0, after: 0 }, children: [tr(t, { b: true, i: true })] });
}
function Bullet(spec) {
  return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(spec),
                         spacing: { line: DS, before: 0, after: 0 } });
}
function Num(spec) {
  return new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: runs(spec),
                         spacing: { line: DS, before: 0, after: 0 } });
}
function Code(lines, o = {}) {
  const sz = o.size || 18;
  return lines.map((l, i) => new Paragraph({
    children: [tr(l === '' ? ' ' : l, { mono: true, size: sz })],
    spacing: { line: 240, before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 200 : 0 },
    indent: { left: 360 }, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
    keepNext: o.keepTogether !== false && i < lines.length - 1, keepLines: true,
  }));
}
function Ref(spec) {
  return new Paragraph({ children: runs(spec), spacing: { line: DS, before: 0, after: 0 },
                         indent: { left: 720, hanging: 720 } });
}
const Blank = () => new Paragraph({ children: [tr(' ')], spacing: { line: DS, before: 0, after: 0 } });

function titlePage({ title, author, affiliation, course, assignment, date }) {
  const c = [];
  for (let i = 0; i < 3; i++) c.push(Blank());
  c.push(new Paragraph({ children: [tr(title, { b: true })], alignment: AlignmentType.CENTER, spacing: { line: DS } }));
  c.push(Blank());
  [author, affiliation, course, assignment, date].filter(Boolean).forEach(l =>
    c.push(new Paragraph({ children: [tr(l)], alignment: AlignmentType.CENTER, spacing: { line: DS } })));
  return c;
}

// Figures and tables are numbered in order of emission.
class Counter {
  constructor() { this.fig = 0; this.tbl = 0; this.figs = {}; this.tbls = {}; }
  figNo(key) { if (!(key in this.figs)) this.figs[key] = ++this.fig; return this.figs[key]; }
  tblNo(key) { if (!(key in this.tbls)) this.tbls[key] = ++this.tbl; return this.tbls[key]; }
}
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
// APA figure: number (bold) + title (italic) above, image, optional Note below.
function Fig(counter, key, file, title, note, o = {}) {
  const n = counter.figNo(key);
  const buf = fs.readFileSync(file);
  const { w, h } = pngSize(buf);
  const maxW = o.maxW || 624, maxH = o.maxH || 400;
  const s = Math.min(maxW / w, maxH / h);
  const W = Math.round(w * s), Hh = Math.round(h * s);
  const out = [
    new Paragraph({ children: [tr(`Figure ${n}`, { b: true })], spacing: { line: 240, before: 240, after: 0 }, keepNext: true }),
    new Paragraph({ children: [tr(title, { i: true })], spacing: { line: 240, before: 0, after: 120 }, keepNext: true }),
    new Paragraph({ children: [new ImageRun({ type: 'png', data: buf, transformation: { width: W, height: Hh } })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: note ? 60 : 240 }, keepNext: !!note }),
  ];
  if (note) out.push(new Paragraph({ children: [tr('Note. ', { i: true }), ...runs(note)], spacing: { line: 240, before: 0, after: 240 } }));
  return out;
}
// APA table: number (bold) + title (italic), header rule + bottom rule only.
function Tbl(counter, key, title, headers, rows, widths, o = {}) {
  const n = counter.tblNo(key);
  const sz = o.size || 20;
  const border = (on) => ({ style: on ? BorderStyle.SINGLE : BorderStyle.NONE, size: 8, color: on ? '000000' : 'FFFFFF' });
  const cell = (text, w, { header = false, last = false, mono = false, right = false } = {}) => new TableCell({
    children: [new Paragraph({ children: [tr(String(text), { b: header, mono, size: mono ? sz - 2 : sz })],
      alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { line: 240, before: 30, after: 30 } })],
    width: { size: w, type: WidthType.DXA },
    borders: { top: border(header), bottom: border(header || last), left: border(false), right: border(false) },
    margins: { top: 30, bottom: 30, left: 70, right: 70 },
  });
  const rightCols = o.rightCols || [];
  const trows = [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { header: true, right: rightCols.includes(i) })) })];
  rows.forEach((r, ri) => trows.push(new TableRow({ cantSplit: true, children: r.map((c, i) =>
    cell(c, widths[i], { last: ri === rows.length - 1, mono: (o.monoCols || []).includes(i), right: rightCols.includes(i) })) })));
  const out = [
    new Paragraph({ children: [tr(`Table ${n}`, { b: true })], spacing: { line: 240, before: 240, after: 0 }, keepNext: true }),
    new Paragraph({ children: [tr(title, { i: true })], spacing: { line: 240, before: 0, after: 120 }, keepNext: true }),
    new Table({ rows: trows, width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
      borders: { top: border(false), bottom: border(false), left: border(false), right: border(false), insideHorizontal: border(false), insideVertical: border(false) } }),
  ];
  if (o.note) out.push(new Paragraph({ children: [tr('Note. ', { i: true }), ...runs(o.note)], spacing: { line: 240, before: 80, after: 240 } }));
  else out.push(new Paragraph({ children: [tr(' ')], spacing: { line: 240, before: 0, after: 120 } }));
  return out;
}

function buildDoc({ title, children }) {
  return new Document({
    creator: 'Sriman Cherukuru', title,
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: '000000' },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { line: DS, before: 0, after: 0 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: '000000' },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { line: DS, before: 0, after: 0 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 24, bold: true, italics: true, color: '000000' },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { line: DS, before: 0, after: 0 }, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 },
                            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24 })] })] }) },
      children,
    }],
  });
}
async function write(doc, out) {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
}
module.exports = { tr, runs, P, H1, H2, H3, Bullet, Num, Code, Ref, Blank, titlePage, Counter, Fig, Tbl, buildDoc, write, FONT, MONO };
