/**
 * Iron District — booking logger.
 *
 * This file is NOT deployed automatically. Copy/paste its contents into the
 * Apps Script editor attached to your Google Sheet (see README.md "Booking
 * submissions" section for the full step-by-step).
 *
 * What it does: every time the website's booking form is submitted, the
 * browser sends the name/email/program here, and this script appends a row
 * to the active sheet with a timestamp — after validating and sanitizing
 * everything, since this URL is public and anyone could technically POST to it.
 */

const ALLOWED_PROGRAMS = ['Barbell Foundations', 'Competitive Powerlifting', 'Engine & Iron', 'Open Platform'];
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_TIME_MS = 1500; // real visitors take at least this long to fill in the form

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const params = e.parameter || {};

  // Honeypot: real visitors never see or fill this field (hidden via CSS on
  // the site). If it has a value, this is almost certainly a bot — silently
  // accept without writing anything, so the bot doesn't learn it was caught.
  if (params.website) {
    return jsonResponse({ status: 'ok' });
  }

  // Timing check: a hidden timestamp is set client-side when the form loads.
  // Submissions that arrive implausibly fast are usually scripted, not human.
  const submittedAt = Number(params.ts);
  if (!submittedAt || Date.now() - submittedAt < MIN_FILL_TIME_MS) {
    return jsonResponse({ status: 'ok' }); // pretend success, don't tip off the bot
  }

  const name = sanitizeField(params.name, MAX_NAME_LENGTH);
  const email = sanitizeField(params.email, MAX_EMAIL_LENGTH);
  const program = params.program;

  // Validate everything server-side — the client-side checks in script.js are
  // just for user experience and can't be trusted on their own.
  if (!name || !email || !EMAIL_PATTERN.test(email) || !ALLOWED_PROGRAMS.includes(program)) {
    return jsonResponse({ status: 'error', message: 'Invalid submission.' });
  }

  sheet.appendRow([new Date(), name, email, program]);

  return jsonResponse({ status: 'ok' });
}

/**
 * Trims to a max length and neutralizes spreadsheet-formula injection: if a
 * value starts with =, +, -, or @, Excel/Sheets can interpret it as a formula
 * when the sheet is later exported/opened elsewhere. Prefixing with a straight
 * quote forces it to display as plain text instead.
 */
function sanitizeField(value, maxLength) {
  if (typeof value !== 'string') return '';
  let clean = value.trim().slice(0, maxLength);
  if (/^[=+\-@]/.test(clean)) clean = "'" + clean;
  return clean;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * One-time helper: run this once from the Apps Script editor (select
 * setupHeaderRow in the function dropdown, click Run) to add column headers
 * to row 1 of your sheet before you start collecting bookings.
 */
function setupHeaderRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Name', 'Email', 'Program']]);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
}
