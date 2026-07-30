import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const sourcePath = path.join(scriptDir, 'COMPLETE_PROJECT_DOCUMENTATION.md');
const outputPath = path.join(scriptDir, 'MTU_Academic_Management_and_Instructor_Performance_Evaluation_System_Documentation.pdf');
const logoCandidates = [path.join(workspaceRoot, 'logo.png'), path.join(workspaceRoot, 'frontend', 'src', 'assets', 'mtu-logo.png')];
const logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate));
const markdown = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

const colors = {
  navy: '#173B57',
  teal: '#128C87',
  gold: '#D5A52E',
  ink: '#24313A',
  muted: '#60717C',
  line: '#D8E1E5',
  pale: '#EFF5F6',
  white: '#FFFFFF',
  code: '#F4F6F7'
};

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 66, right: 52, bottom: 62, left: 52 },
  bufferPages: true,
  info: {
    Title: 'MTU Academic Management and Instructor Performance Evaluation System - Complete Project Documentation',
    Author: 'Dawit Mamo',
    Subject: 'System, user, deployment, database, API, testing, and maintenance documentation',
    Keywords: 'MTU, academic management, instructor evaluation, MERN, MongoDB, React, Express, documentation'
  }
});

const output = fs.createWriteStream(outputPath);
doc.pipe(output);

let pageCount = 1;
doc.on('pageAdded', () => { pageCount += 1; });

function cleanInline(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
}

function ensureSpace(height) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function paragraph(text, options = {}) {
  const value = cleanInline(text).trim();
  if (!value) return;
  doc.font(options.font || 'Helvetica')
    .fontSize(options.size || 10.2)
    .fillColor(options.color || colors.ink)
    .text(value, { lineGap: options.lineGap ?? 2.6, align: options.align || 'justify', indent: options.indent || 0 });
  doc.moveDown(options.after ?? 0.55);
}

function heading(level, text) {
  const value = cleanInline(text).trim();
  if (level === 1) {
    if (doc.y > doc.page.margins.top + 25) doc.addPage();
    doc.rect(doc.page.margins.left, doc.y, 7, 30).fill(colors.teal);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(colors.navy).text(value, doc.page.margins.left + 16, doc.y + 3, { lineGap: 1 });
    doc.moveDown(0.7);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(colors.gold).lineWidth(1.5).stroke();
    doc.moveDown(0.8);
    return;
  }
  const size = level === 2 ? 15 : 12;
  ensureSpace(level === 2 ? 42 : 30);
  doc.moveDown(level === 2 ? 0.7 : 0.35);
  doc.font('Helvetica-Bold').fontSize(size).fillColor(level === 2 ? colors.teal : colors.navy).text(value, { lineGap: 1.5 });
  doc.moveDown(0.35);
}

function listItem(text, ordered, index) {
  ensureSpace(28);
  const x = doc.page.margins.left;
  const bullet = ordered ? `${index}.` : '\u2022';
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.teal).text(bullet, x, doc.y, { width: 22, align: ordered ? 'right' : 'center' });
  doc.font('Helvetica').fontSize(10.2).fillColor(colors.ink).text(cleanInline(text), x + 28, doc.y - 12, { width: doc.page.width - doc.page.margins.right - x - 28, lineGap: 2.3 });
  doc.moveDown(0.3);
}

function codeBlock(code) {
  const value = code.replace(/\s+$/, '');
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Courier').fontSize(8.4);
  const height = doc.heightOfString(value, { width: width - 20, lineGap: 1.3 }) + 18;
  ensureSpace(Math.min(height, doc.page.height - 150));
  const y = doc.y;
  doc.roundedRect(doc.page.margins.left, y, width, height, 4).fill(colors.code);
  doc.font('Courier').fontSize(8.4).fillColor('#29343A').text(value, doc.page.margins.left + 10, y + 9, { width: width - 20, lineGap: 1.3 });
  doc.y = y + height + 8;
}

function note(text) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Helvetica-Oblique').fontSize(9.6);
  const height = doc.heightOfString(cleanInline(text), { width: width - 28, lineGap: 2 }) + 20;
  ensureSpace(height);
  const y = doc.y;
  doc.roundedRect(doc.page.margins.left, y, width, height, 4).fill(colors.pale);
  doc.rect(doc.page.margins.left, y, 5, height).fill(colors.gold);
  doc.font('Helvetica-Oblique').fontSize(9.6).fillColor(colors.ink).text(cleanInline(text), doc.page.margins.left + 16, y + 9, { width: width - 28, lineGap: 2 });
  doc.y = y + height + 8;
}

function parseTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cleanInline(cell.trim()));
}

function isSeparatorRow(row) {
  return row.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function table(rows) {
  if (rows.length < 2) return;
  const parsed = rows.map(parseTableRow).filter((row) => !isSeparatorRow(row));
  if (!parsed.length) return;
  const columns = parsed[0].length;
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const ratios = {
    2: [0.28, 0.72],
    3: [0.24, 0.34, 0.42],
    4: [0.17, 0.23, 0.28, 0.32],
    5: [0.13, 0.18, 0.24, 0.19, 0.26]
  }[columns] || Array(columns).fill(1 / columns);
  const widths = ratios.map((ratio) => ratio * availableWidth);

  function drawRow(row, header = false) {
    doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8.1 : 7.8);
    const heights = row.map((cell, index) => doc.heightOfString(cell, { width: widths[index] - 10, lineGap: 1.1 }));
    const rowHeight = Math.max(22, ...heights.map((height) => height + 10));
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (!header) drawRow(parsed[0], true);
    }
    let x = doc.page.margins.left;
    const y = doc.y;
    row.forEach((cell, index) => {
      doc.rect(x, y, widths[index], rowHeight).fillAndStroke(header ? colors.navy : colors.white, colors.line);
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8.1 : 7.8).fillColor(header ? colors.white : colors.ink)
        .text(cell, x + 5, y + 5, { width: widths[index] - 10, lineGap: 1.1 });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  }

  ensureSpace(60);
  parsed.forEach((row, index) => drawRow(row, index === 0));
  doc.moveDown(0.7);
}

function cover() {
  const width = doc.page.width;
  const height = doc.page.height;
  doc.rect(0, 0, width, height).fill('#F8FBFC');
  doc.rect(0, 0, 22, height).fill(colors.teal);
  doc.rect(22, 0, 8, height).fill(colors.gold);
  if (logoPath) doc.image(logoPath, width / 2 - 52, 72, { fit: [104, 104], align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(colors.teal).text('MIZAN-TEPI UNIVERSITY', 70, 202, { width: width - 110, align: 'center', characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(colors.navy).text('Academic Management and\nInstructor Performance\nEvaluation System', 68, 238, { width: width - 106, align: 'center', lineGap: 7 });
  doc.moveTo(130, 356).lineTo(width - 100, 356).strokeColor(colors.gold).lineWidth(2).stroke();
  doc.font('Helvetica').fontSize(16).fillColor(colors.ink).text('Complete Project Documentation', 70, 382, { width: width - 110, align: 'center' });
  doc.font('Helvetica').fontSize(11).fillColor(colors.muted).text('System Analysis \u2022 Architecture \u2022 Database \u2022 API \u2022 User Guide\nDeployment \u2022 Testing \u2022 Security \u2022 Maintenance \u2022 Duplication Guide', 70, 415, { width: width - 110, align: 'center', lineGap: 5 });
  doc.roundedRect(115, 520, width - 200, 112, 8).fill(colors.pale);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy).text('Prepared by', 135, 542, { width: width - 240, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(colors.teal).text('Dawit Mamo', 135, 565, { width: width - 240, align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text('Version 1.0 \u2022 July 2026', 135, 594, { width: width - 240, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text('MERN application for academic administration and multi-source instructor performance evaluation', 78, height - 78, { width: width - 116, align: 'center' });
  doc.addPage();
}

cover();

const lines = markdown.split('\n');
let index = 0;
let orderedIndex = 0;
while (index < lines.length) {
  const line = lines[index];
  const trimmed = line.trim();
  if (!trimmed) { doc.moveDown(0.25); orderedIndex = 0; index += 1; continue; }
  if (trimmed === '<!-- PAGEBREAK -->') { doc.addPage(); index += 1; continue; }
  if (trimmed.startsWith('<!--')) { index += 1; continue; }
  if (trimmed.startsWith('```')) {
    const block = [];
    index += 1;
    while (index < lines.length && !lines[index].trim().startsWith('```')) { block.push(lines[index]); index += 1; }
    if (index < lines.length) index += 1;
    codeBlock(block.join('\n'));
    continue;
  }
  if (trimmed.startsWith('|')) {
    const rows = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) { rows.push(lines[index]); index += 1; }
    table(rows);
    continue;
  }
  const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (headingMatch) { heading(headingMatch[1].length, headingMatch[2]); index += 1; continue; }
  const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (orderedMatch) { orderedIndex += 1; listItem(orderedMatch[2], true, orderedIndex); index += 1; continue; }
  const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) { orderedIndex = 0; listItem(bulletMatch[1], false, 0); index += 1; continue; }
  if (trimmed.startsWith('>')) { note(trimmed.replace(/^>\s?/, '')); index += 1; continue; }

  const paragraphLines = [trimmed];
  index += 1;
  while (index < lines.length) {
    const next = lines[index].trim();
    if (!next || next.startsWith('#') || next.startsWith('|') || next.startsWith('```') || next.startsWith('- ') || next.startsWith('* ') || next.startsWith('>') || /^\d+\.\s+/.test(next) || next.startsWith('<!--')) break;
    paragraphLines.push(next);
    index += 1;
  }
  paragraph(paragraphLines.join(' '));
}

const range = doc.bufferedPageRange();
for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
  doc.switchToPage(pageIndex);
  if (pageIndex === 0) continue;
  const yTop = 34;
  const yBottom = doc.page.height - 32;
  doc.font('Helvetica').fontSize(7.7).fillColor(colors.muted)
    .text('MTU Academic Management and Instructor Performance Evaluation System - Complete Project Documentation', doc.page.margins.left, yTop, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'left', lineBreak: false });
  doc.moveTo(doc.page.margins.left, 50).lineTo(doc.page.width - doc.page.margins.right, 50).strokeColor(colors.line).lineWidth(0.6).stroke();
  doc.moveTo(doc.page.margins.left, yBottom - 10).lineTo(doc.page.width - doc.page.margins.right, yBottom - 10).strokeColor(colors.line).lineWidth(0.6).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
    .text('Dawit Mamo \u2022 Mizan-Tepi University', doc.page.margins.left, yBottom, { width: 250, lineBreak: false })
    .text(`Page ${pageIndex + 1} of ${range.count}`, doc.page.width - doc.page.margins.right - 120, yBottom, { width: 120, align: 'right', lineBreak: false });
}

output.on('finish', () => {
  const size = fs.statSync(outputPath).size;
  console.log(`Documentation PDF generated: ${outputPath}`);
  console.log(`Pages: ${pageCount}; Size: ${size} bytes`);
});

doc.end();
