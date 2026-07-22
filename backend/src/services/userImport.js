import { parse } from 'csv-parse/sync';

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = class DOMMatrix {};
if (!globalThis.ImageData) globalThis.ImageData = class ImageData {};
if (!globalThis.Path2D) globalThis.Path2D = class Path2D {};
const pdfParserModule = import('pdf-parse');

const fieldAliases = new Map([
  ['firstname', 'firstName'],
  ['first', 'firstName'],
  ['lastname', 'lastName'],
  ['last', 'lastName'],
  ['email', 'email'],
  ['emailaddress', 'email'],
  ['studentnumber', 'studentNumber'],
  ['studentid', 'studentNumber'],
  ['employeenumber', 'employeeNumber'],
  ['employeeid', 'employeeNumber'],
  ['staffid', 'employeeNumber'],
  ['department', 'department'],
  ['departmentid', 'department'],
  ['yearlevel', 'yearLevel'],
  ['year', 'yearLevel'],
  ['gpa', 'gpa'],
  ['academicstream', 'academicStream'],
  ['stream', 'academicStream'],
  ['branch', 'academicStream'],
  ['password', 'password']
]);

function normalizedField(value) {
  const compact = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return fieldAliases.get(compact) || String(value || '').trim();
}

function parseDelimited(text, delimiter) {
  return parse(text, {
    columns: (headers) => headers.map(normalizedField),
    delimiter,
    skip_empty_lines: true,
    trim: true,
    bom: true
  });
}

function meaningfulPdfLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line));
}

function parseLabeledRecords(lines) {
  const records = [];
  let current = {};
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const field = normalizedField(match[1]);
    if (!fieldAliases.has(String(match[1]).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))) continue;
    if (field === 'firstName' && current.email) {
      records.push(current);
      current = {};
    }
    current[field] = match[2].trim();
  }
  if (current.email) records.push(current);
  return records;
}

async function pdfRecords(buffer) {
  let parser;
  try {
    const { PDFParse } = await pdfParserModule;
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const lines = meaningfulPdfLines(result.text || '');
    if (!lines.length) {
      const error = new Error('The PDF contains no readable text. Scanned image-only PDFs require OCR before import.');
      error.statusCode = 400;
      throw error;
    }
    const headerIndex = lines.findIndex((line) => /first[\s_-]*name/i.test(line) && /email/i.test(line));
    if (headerIndex >= 0) {
      const tableLines = lines.slice(headerIndex);
      const header = tableLines[0];
      if (header.includes('|')) return parseDelimited(tableLines.join('\n'), '|');
      if (header.includes(',')) return parseDelimited(tableLines.join('\n'), ',');
      if (header.includes('\t')) return parseDelimited(tableLines.join('\n'), '\t');
    }
    const labeled = parseLabeledRecords(lines);
    if (labeled.length) return labeled;
    const error = new Error('PDF records were not recognized. Use a pipe-separated table or labeled fields such as First Name: and Email:.');
    error.statusCode = 400;
    throw error;
  } catch (error) {
    if (error.statusCode) throw error;
    const wrapped = new Error('The PDF file could not be read. Verify that it is a valid, unencrypted PDF.');
    wrapped.statusCode = 400;
    wrapped.details = error.message;
    throw wrapped;
  } finally {
    await parser?.destroy().catch(() => {});
  }
}

export async function recordsFromUpload(file) {
  const fileName = String(file?.originalname || '').toLowerCase();
  if (fileName.endsWith('.csv')) {
    try {
      return parseDelimited(file.buffer, ',');
    } catch {
      const error = new Error('The CSV file could not be parsed. Check its header and row formatting.');
      error.statusCode = 400;
      throw error;
    }
  }
  if (fileName.endsWith('.pdf')) return pdfRecords(file.buffer);
  const error = new Error('Only CSV and PDF files are accepted');
  error.statusCode = 400;
  throw error;
}
