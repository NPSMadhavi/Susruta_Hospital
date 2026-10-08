import assert from "node:assert/strict";
import test from "node:test";
import { dateSearchTerms, matchesPortalSearch } from "./portal-search";

test("uploaded dates use the displayed IST day around midnight", () => {
  const beforeMidnight = dateSearchTerms("2026-10-04T18:29:59Z");
  const afterMidnight = dateSearchTerms("2026-10-04T18:30:00Z");

  assert.ok(beforeMidnight.includes("4 Oct 2026"));
  assert.ok(afterMidnight.includes("5 Oct 2026"));
  assert.ok(afterMidnight.includes("2026-10-05"));
  assert.equal(matchesPortalSearch("5 Oct 2026", afterMidnight), true);
  assert.equal(matchesPortalSearch("4 Oct 2026", afterMidnight), false);
});

test("dates match short or full month names and common numeric formats", () => {
  const values = dateSearchTerms("2026-10-05");

  for (const query of ["5 Oct 2026", "5 October 2026", "oct", "2026", "5/10/2026", "05/10/2026", "05-10-2026", "05.10.2026", "2026-10-05"]) {
    assert.equal(matchesPortalSearch(query, values), true, query);
  }
  assert.equal(matchesPortalSearch("August", values), false);
});

test("date-only values keep their calendar day and handle leap dates", () => {
  assert.ok(dateSearchTerms("2026-08-25").includes("25 Aug 2026"));
  assert.ok(dateSearchTerms("2024-02-29").includes("2024-02-29"));
});

test("numeric date tokens do not partially match a different day, year, or patient ID", () => {
  assert.equal(matchesPortalSearch("5 Oct 2026", dateSearchTerms("2026-10-25")), false);
  assert.equal(matchesPortalSearch("5 Oct 2026", ["PT-55001", ...dateSearchTerms("2026-10-25")]), false);
  assert.equal(matchesPortalSearch("5 October", dateSearchTerms("2025-10-04")), false);
  assert.equal(matchesPortalSearch("10 Oct", dateSearchTerms("2026-10-05")), false);
  assert.equal(matchesPortalSearch("05 Oct", dateSearchTerms("2026-10-05")), true);
});

test("numeric dates preserve day/month order, including combined text queries", () => {
  const october = ["Prescription Document", "Dr. P. Murali Krishna", ...dateSearchTerms("2026-10-05")];
  const may = ["Prescription Document", "Dr. P. Murali Krishna", ...dateSearchTerms("2026-05-10")];

  for (const query of ["05/10/2026", "5-10-2026", "05.10.2026", "2026-10-05", "Murali 05/10/2026 document"]) {
    assert.equal(matchesPortalSearch(query, october), true, query);
    assert.equal(matchesPortalSearch(query, may), false, query);
  }
  assert.equal(matchesPortalSearch("10/05/2026", may), true);
  assert.equal(matchesPortalSearch("10/05/2026", october), false);
});

test("ordinary numeric queries preserve filename and patient ID substring matching", () => {
  assert.equal(matchesPortalSearch("001", ["PT-00127"]), true);
  assert.equal(matchesPortalSearch("00127", ["PT-00127"]), true);
  assert.equal(matchesPortalSearch("202", ["report_2026.pdf"]), true);
  assert.equal(matchesPortalSearch("001 05/10/2026", ["PT-00127", ...dateSearchTerms("2026-10-05")]), true);
});

test("standalone short numbers filter uploaded calendar days without matching shared patient IDs", () => {
  const documents = [
    { name: "directory.png", uploaded: "2026-10-05" },
    { name: "Work_Report.docx", uploaded: "2026-10-01" },
    { name: "ChatGPT Image Aug 7, 2026, 09_06_12 AM.png", uploaded: "2026-10-01" },
  ];
  const results = (query: string) => documents.filter((document) => matchesPortalSearch(query, [
    document.name, "PT-0001", "Uploaded", ...dateSearchTerms(document.uploaded),
  ])).map((document) => document.name);

  assert.deepEqual(results("1"), [documents[1].name, documents[2].name]);
  assert.deepEqual(results("01"), [documents[1].name, documents[2].name]);
  assert.deepEqual(results("5"), [documents[0].name]);
  assert.deepEqual(results(" 05 "), [documents[0].name]);
  assert.deepEqual(results("10"), []);
  assert.deepEqual(results("1 oct"), [documents[1].name, documents[2].name]);
  assert.deepEqual(results("PT-0001"), documents.map((document) => document.name));
  assert.deepEqual(results("001"), documents.map((document) => document.name));
  assert.deepEqual(results("09_06_12"), [documents[2].name]);
});

test("a day query does not match numeric month or year fields", () => {
  assert.equal(matchesPortalSearch("1", ["PT-0001", ...dateSearchTerms("2026-01-05")]), false);
  assert.equal(matchesPortalSearch("1", ["PT-0001", ...dateSearchTerms("2026-01-01")]), true);
  assert.equal(matchesPortalSearch("1", dateSearchTerms("2026-01-11")), false);
  assert.equal(matchesPortalSearch("11", dateSearchTerms("2026-01-11")), true);
  assert.equal(matchesPortalSearch("21", dateSearchTerms("2021-01-05")), false);
  assert.equal(matchesPortalSearch("31", dateSearchTerms("2026-01-31")), true);
  assert.equal(matchesPortalSearch("1", [null, "PT-0001"]), false);
});

test("prescriptions match title, date, and doctor together in any order", () => {
  const values = [
    "Prescription Document",
    ...dateSearchTerms("2026-10-11"),
    "Prescribed by Dr. P. Murali Krishna",
  ];

  assert.equal(matchesPortalSearch("  DOCUMENT   11 October 2026 dr p murali  ", values), true);
  assert.equal(matchesPortalSearch("krishna prescription oct", values), true);
  assert.equal(matchesPortalSearch("Dr. P. Murali Krishna", values), true);
  assert.equal(matchesPortalSearch("prescription cardiology", values), false);
  assert.equal(matchesPortalSearch("25 Aug 2026", values), false);
});

test("medical documents match filenames, patient IDs, and uploaded dates", () => {
  const values = ["Work_Report.docx", "PT-00127", "Uploaded", ...dateSearchTerms("2026-10-01")];

  assert.equal(matchesPortalSearch("WORK report.docx", values), true);
  assert.equal(matchesPortalSearch("report", values), true);
  assert.equal(matchesPortalSearch("pt-00127", values), true);
  assert.equal(matchesPortalSearch("00127 1 October", values), true);
  assert.equal(matchesPortalSearch("Uploaded: 01/10/2026", values), true);
  assert.equal(matchesPortalSearch("directory.png", values), false);
  assert.equal(matchesPortalSearch("05-10-2026", ["report_05-10-2026.pdf", ...dateSearchTerms("2026-08-25")]), true);
  assert.equal(matchesPortalSearch("2026-10-05", ["report_2026-10-05.pdf", ...dateSearchTerms("2026-08-25")]), true);
});

test("clearing the query restores rows and missing fields are safe", () => {
  assert.equal(matchesPortalSearch("", ["Prescription Document"]), true);
  assert.equal(matchesPortalSearch("  \t\n ", []), true);
  assert.equal(matchesPortalSearch("document", [null, undefined, "Prescription Document"]), true);
  assert.equal(matchesPortalSearch("document", [null, undefined]), false);
});

test("missing and invalid dates contribute no searchable values", () => {
  for (const value of [null, undefined, "", "   ", "not-a-date", "2026-02-30", "2026-02-29", "2026-13-01"]) {
    assert.deepEqual(dateSearchTerms(value), [], String(value));
  }
});