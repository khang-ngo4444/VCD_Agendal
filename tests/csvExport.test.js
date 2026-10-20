// CSV fields that Excel and Google Sheets read back exactly, and never run as formulas.
const { field, toCsv } = require('../services/csvExport');

test('plain text stays as it is; empty values are empty', () => {
  expect(field('Read chapter 5')).toBe('Read chapter 5');
  expect(field(null)).toBe('');
  expect(field(undefined)).toBe('');
  expect(field(0)).toBe('0');
});

test('commas, quotes and line breaks are quoted, quotes doubled', () => {
  expect(field('Buy milk, eggs')).toBe('"Buy milk, eggs"');
  expect(field('Say "hi"')).toBe('"Say ""hi"""');
  expect(field('line one\nline two')).toBe('"line one\nline two"');
});

test('text a spreadsheet would run as a formula is kept as text', () => {
  expect(field('=HYPERLINK("http://evil.example","click")')).toBe('"\'=HYPERLINK(""http://evil.example"",""click"")"');
  expect(field('+1 call mum')).toBe("'+1 call mum");
  expect(field('-5 kg')).toBe("'-5 kg");
  expect(field('@team')).toBe("'@team");
});

test('a file starts with the UTF-8 BOM and uses CRLF rows', () => {
  const csv = toCsv(['Title', 'Project'], [['Học bài', 'Inbox']]);
  expect(csv.startsWith('﻿')).toBe(true);
  expect(csv.slice(1)).toBe('Title,Project\r\nHọc bài,Inbox\r\n');
});
