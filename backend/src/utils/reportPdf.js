import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultLogoPath = path.resolve(moduleDirectory, '../assets/mtu-logo.png');
const colors = {
  primary: '#087443',
  primaryDark: '#06442a',
  primarySoft: '#eaf6ef',
  accent: '#e4ad31',
  ink: '#15251d',
  muted: '#66766e',
  border: '#d9e5dd',
  surface: '#f7faf8',
  white: '#ffffff'
};

function text(value, fallback = '-') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function streamName(value) {
  return value ? String(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'General program';
}

export function renderInstructorCourseReportPdf(output, data, options = {}) {
  const { instructor, department, semester, course, assignment, report, scores, evaluationCounts } = data;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, right: 48, bottom: 54, left: 48 }, bufferPages: true, info: {
    Title: `${course.code} Instructor Performance Evaluation Report`,
    Author: 'Mizan-Tepi University',
    Subject: `Course-specific performance evaluation for ${instructor.name}`
  } });
  doc.pipe(output);
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 96;
  let cursorY = 0;

  const addPage = () => {
    doc.addPage();
    cursorY = 50;
  };
  const ensureSpace = (height) => {
    if (cursorY + height > doc.page.height - 116) addPage();
  };
  const sectionHeading = (title, subtitle) => {
    ensureSpace(subtitle ? 48 : 31);
    doc.fillColor(colors.primaryDark).font('Helvetica-Bold').fontSize(12).text(title.toUpperCase(), 48, cursorY, { characterSpacing: 0.7 });
    cursorY += 19;
    if (subtitle) {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8.5).text(subtitle, 48, cursorY, { width: contentWidth });
      cursorY += 22;
    } else cursorY += 8;
  };
  const infoCard = (x, y, width, label, value) => {
    doc.roundedRect(x, y, width, 54, 9).fillAndStroke(colors.surface, colors.border);
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), x + 12, y + 10, { width: width - 24, characterSpacing: 0.45 });
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(text(value), x + 12, y + 26, { width: width - 24, height: 20, ellipsis: true });
  };
  const contributionCard = (x, y, width, label, rawScore, contribution, maximum) => {
    doc.roundedRect(x, y, width, 58, 10).fillAndStroke(colors.white, colors.border);
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), x + 11, y + 9, { width: width - 22 });
    doc.fillColor(colors.primaryDark).font('Helvetica-Bold').fontSize(15).text(`${contribution}%`, x + 11, y + 23, { width: width - 22 });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(`${rawScore}/5 - maximum ${maximum}%`, x + 11, y + 44, { width: width - 22 });
  };
  const listSection = (title, items, emptyText) => {
    sectionHeading(title);
    const values = items?.length ? items : [emptyText];
    values.forEach((item) => {
      ensureSpace(28);
      doc.circle(55, cursorY + 5, 2.3).fill(colors.accent);
      doc.fillColor(items?.length ? colors.ink : colors.muted).font(items?.length ? 'Helvetica' : 'Helvetica-Oblique').fontSize(9)
        .text(text(item), 66, cursorY, { width: contentWidth - 18, lineGap: 2 });
      cursorY = doc.y + 8;
    });
  };

  doc.rect(0, 0, pageWidth, 138).fill(colors.primaryDark);
  doc.rect(0, 132, pageWidth, 6).fill(colors.accent);
  const logoPath = options.logoPath || defaultLogoPath;
  if (fs.existsSync(logoPath)) {
    doc.roundedRect(48, 28, 76, 76, 14).fill(colors.white);
    try { doc.image(logoPath, 55, 35, { fit: [62, 62], align: 'center', valign: 'center' }); } catch { /* Keep the branded text header if the image cannot be decoded. */ }
  }
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(17).text('MIZAN-TEPI UNIVERSITY', 142, 31, { width: 390 });
  doc.fillColor('#cfe8d9').font('Helvetica').fontSize(9).text('Academic Management and Instructor Performance Evaluation System', 142, 56, { width: 390 });
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(13).text('COURSE PERFORMANCE EVALUATION REPORT', 142, 81, { width: 390 });
  doc.fillColor('#f4d887').font('Helvetica-Bold').fontSize(8).text(`${text(department.name).toUpperCase()}  |  ${course.code}`, 142, 105, { width: 390, characterSpacing: 0.5 });

  cursorY = 160;
  const gap = 10;
  const half = (contentWidth - gap) / 2;
  infoCard(48, cursorY, half, 'Instructor', instructor.name);
  infoCard(48 + half + gap, cursorY, half, 'Department', `${department.name} (${department.code || '-'})`);
  cursorY += 64;
  infoCard(48, cursorY, half, 'Course', `${course.code} - ${course.title}`);
  infoCard(48 + half + gap, cursorY, half, 'Semester', `${semester.name} ${semester.academicYear}`);
  cursorY += 72;

  doc.roundedRect(48, cursorY, 142, 126, 13).fill(colors.primary);
  doc.fillColor('#d9f1e3').font('Helvetica-Bold').fontSize(8).text('FINAL RESULT', 62, cursorY + 17, { width: 114, align: 'center', characterSpacing: 0.8 });
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(33).text(`${scores.overall}%`, 58, cursorY + 41, { width: 122, align: 'center' });
  doc.fillColor('#d9f1e3').font('Helvetica').fontSize(8).text('out of 100%', 62, cursorY + 84, { width: 114, align: 'center' });
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(7).text(`${evaluationCounts.total} SUBMITTED EVALUATION${evaluationCounts.total === 1 ? '' : 'S'}`, 58, cursorY + 105, { width: 122, align: 'center' });
  const contributionX = 204;
  const contributionWidth = (contentWidth - 156 - 20) / 3;
  contributionCard(contributionX, cursorY, contributionWidth, 'Students', scores.studentScore, scores.studentWeighted, 40);
  contributionCard(contributionX + contributionWidth + 10, cursorY, contributionWidth, 'Peers', scores.peerScore, scores.peerWeighted, 30);
  contributionCard(contributionX + (contributionWidth + 10) * 2, cursorY, contributionWidth, 'HOD', scores.hodScore, scores.hodWeighted, 30);
  const detailY = cursorY + 70;
  doc.roundedRect(contributionX, detailY, contentWidth - 156, 56, 10).fillAndStroke(colors.primarySoft, colors.border);
  const classLabel = course.yearLevel ? `Year ${course.yearLevel}` : text(course.level, 'Class not specified');
  doc.fillColor(colors.primaryDark).font('Helvetica-Bold').fontSize(8).text('COURSE DETAILS', contributionX + 12, detailY + 10);
  doc.fillColor(colors.ink).font('Helvetica').fontSize(8.5).text(`${classLabel}  |  ${streamName(course.academicStream)}  |  ${text(course.creditHours, '0')} credit hours`, contributionX + 12, detailY + 27, { width: contentWidth - 180 });
  doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5).text(`Assignment status: ${text(assignment.status)}  |  Report status: ${text(report.status)}`, contributionX + 12, detailY + 42, { width: contentWidth - 180 });
  cursorY += 148;

  sectionHeading('Category performance', 'Category ratings remain on the approved five-point response scale.');
  if (!report.categoryScores?.length) {
    doc.fillColor(colors.muted).font('Helvetica-Oblique').fontSize(9).text('No scored category data is available for this course.', 48, cursorY);
    cursorY += 25;
  } else {
    report.categoryScores.forEach((item) => {
      ensureSpace(38);
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(8.5).text(item.category, 48, cursorY, { width: 230, ellipsis: true });
      doc.fillColor(colors.primaryDark).font('Helvetica-Bold').fontSize(9).text(`${item.score}/5`, 478, cursorY, { width: 69, align: 'right' });
      cursorY += 15;
      doc.roundedRect(48, cursorY, contentWidth, 7, 3.5).fill('#e4ece7');
      doc.roundedRect(48, cursorY, Math.max(4, contentWidth * Math.min(5, Math.max(0, item.score)) / 5), 7, 3.5).fill(colors.primary);
      cursorY += 20;
    });
  }

  listSection('Strengths', report.strengths, 'No category has reached the strength threshold yet.');
  listSection('Areas for improvement', report.weaknesses, 'No category is currently below the improvement threshold.');
  listSection('Recommendations', report.recommendations, 'No recommendation is available.');

  if (report.finalSummary) {
    sectionHeading('Published final summary');
    ensureSpace(82);
    const summaryTop = cursorY;
    const summaryHeight = Math.max(68, doc.heightOfString(report.finalSummary, { width: contentWidth - 28, lineGap: 3 }) + 32);
    if (summaryTop + summaryHeight > doc.page.height - 116) { addPage(); }
    doc.roundedRect(48, cursorY, contentWidth, summaryHeight, 11).fillAndStroke(colors.primarySoft, colors.border);
    doc.fillColor(colors.ink).font('Helvetica').fontSize(9).text(report.finalSummary, 62, cursorY + 15, { width: contentWidth - 28, lineGap: 3 });
    cursorY += summaryHeight + 14;
  }

  if (report.comments?.length) listSection('Anonymous feedback', report.comments, '');

  ensureSpace(40);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5).text(`Generated ${new Date().toLocaleString('en-GB')}  |  Faculty: ${text(department.faculty)}`, 48, cursorY + 8, { width: contentWidth });

  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const footerY = doc.page.height - 92;
    doc.moveTo(48, footerY - 8).lineTo(doc.page.width - 48, footerY - 8).strokeColor(colors.border).lineWidth(0.7).stroke();
    doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text('Mizan-Tepi University - Official course evaluation report', 48, footerY, { width: 360, lineBreak: false });
    doc.text(`Page ${pageIndex + 1} of ${range.count}`, doc.page.width - 130, footerY, { width: 82, align: 'right', lineBreak: false });
  }
  doc.end();
}
