function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("en-IN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const numericDatePattern = /(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)|(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/g;
const monthPattern = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const namedDatePattern = new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`, "g");
const namedMonthPattern = new RegExp(`\\b(?:${monthPattern})\\b`);
const monthAbbreviations = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function searchDateFragments(value: string) {
  const numericDates = Array.from(value.matchAll(numericDatePattern), (match) => ({
    day: Number(match[3] ?? match[4]),
    month: Number(match[2] ?? match[5]),
    year: Number(match[1] ?? match[6]),
  }));
  const remainingText = normalizeSearchText(value.replace(numericDatePattern, " "));
  const namedDates = Array.from(remainingText.matchAll(namedDatePattern), (match) => ({
    day: Number(match[1]),
    month: monthAbbreviations.indexOf(match[2].slice(0, 3)) + 1,
    year: match[3] ? Number(match[3]) : undefined,
  }));
  return {
    dates: [...numericDates, ...namedDates],
    text: remainingText.replace(namedDatePattern, " ").trim(),
  };
}

/** Match dates as complete fragments and other query words across displayed fields. */
export function matchesPortalSearch(
  query: string,
  values: Array<string | null | undefined>,
): boolean {
  const { dates: queryDates, text: normalizedQuery } = searchDateFragments(query);
  if (!normalizedQuery && !queryDates.length) return true;

  // A short number is a calendar day, not a substring of a month, year, or patient ID.
  const queriedDay = /^\d{1,2}$/.test(query.trim()) ? Number(query.trim()) : 0;
  if (queriedDay >= 1 && queriedDay <= 31) {
    return values.some((value) =>
      searchDateFragments(value ?? "").dates.some((date) => date.day === queriedDay),
    );
  }

  // Keep complete date components together, including dates within filenames.
  if (queryDates.length) {
    const searchableDates = values.flatMap((value) => searchDateFragments(value ?? "").dates);
    if (!queryDates.every((date) => searchableDates.some((candidate) =>
      date.day === candidate.day && date.month === candidate.month &&
      (date.year === undefined || date.year === candidate.year),
    ))) return false;
  }

  const searchableText = normalizeSearchText(values.filter(Boolean).join(" "));
  const searchableWords = new Set(searchableText.split(" "));
  const hasNamedMonth = namedMonthPattern.test(normalizedQuery);
  return normalizedQuery.split(/\s+/).filter(Boolean).every((word) =>
    hasNamedMonth && /^\p{N}+$/u.test(word) ? searchableWords.has(word) : searchableText.includes(word),
  );
}

const dateOptions = { timeZone: "Asia/Kolkata", day: "numeric", year: "numeric" } as const;
const shortDateFormatter = new Intl.DateTimeFormat("en-IN", { ...dateOptions, month: "short" });
const longDateFormatter = new Intl.DateTimeFormat("en-IN", { ...dateOptions, month: "long" });
const numericDateFormatter = new Intl.DateTimeFormat("en-IN", { ...dateOptions, month: "numeric" });

/** Search aliases for the calendar date shown in the patient portal (IST). */
export function dateSearchTerms(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];

  const source = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(source);
  const date = new Date(dateOnly ? `${source}T00:00:00+05:30` : source);
  if (Number.isNaN(date.getTime())) return [];

  const parts = numericDateFormatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  const year = parts.find((part) => part.type === "year")!.value;
  const paddedDay = day.padStart(2, "0");
  const paddedMonth = month.padStart(2, "0");
  const isoDate = `${year}-${paddedMonth}-${paddedDay}`;

  // Date parsing can silently roll impossible dates, such as February 30, forward.
  if (dateOnly && isoDate !== source) return [];

  return [
    shortDateFormatter.format(date),
    longDateFormatter.format(date),
    `${day}/${month}/${year}`,
    `${paddedDay}/${paddedMonth}/${year}`,
    isoDate,
  ];
}