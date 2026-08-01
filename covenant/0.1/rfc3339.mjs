// SPDX-License-Identifier: MPL-2.0

// Positive UTC leap-second dates through IERS Bulletin C 72 (2026-07-06).
// Bulletin C 72 keeps UTC-TAI unchanged from 2017-01-01 until further notice.
// This closed candidate profile fails safely on an unlisted future leap second
// until the table is deliberately updated and reviewed.
//
// Sources:
// - https://datatracker.ietf.org/doc/html/rfc3339#appendix-D
// - https://datacenter.iers.org/versionMetadata.php?filename=mt%2Fbulletinc-072.txt
const POSITIVE_LEAP_SECOND_DATES = [
  "1972-06-30",
  "1972-12-31",
  "1973-12-31",
  "1974-12-31",
  "1975-12-31",
  "1976-12-31",
  "1977-12-31",
  "1978-12-31",
  "1979-12-31",
  "1981-06-30",
  "1982-06-30",
  "1983-06-30",
  "1985-06-30",
  "1987-12-31",
  "1989-12-31",
  "1990-12-31",
  "1992-06-30",
  "1993-06-30",
  "1994-06-30",
  "1995-12-31",
  "1997-06-30",
  "1998-12-31",
  "2005-12-31",
  "2008-12-31",
  "2012-06-30",
  "2015-06-30",
  "2016-12-31",
];

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/;
const SECONDS_PER_DAY = 86_400n;

function daysFromCivil(year, month, day) {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

const LEAP_SECOND_BOUNDARY_DAYS = new Set(POSITIVE_LEAP_SECOND_DATES.map((date) => {
  const [year, month, day] = date.split("-").map(Number);
  return String(daysFromCivil(year, month, day) + 1);
}));

function floorDivision(value, divisor) {
  let quotient = value / divisor;
  if (value < 0n && value % divisor !== 0n) quotient -= 1n;
  return quotient;
}

function positiveRemainder(value, divisor) {
  const remainder = value % divisor;
  return remainder < 0n ? remainder + divisor : remainder;
}

/**
 * Parse the schema's RFC 3339 date-time domain into an exactly comparable
 * instant. Leap seconds keep a separate phase at the following POSIX boundary,
 * so 23:59:60 remains later than 23:59:59 and earlier than 00:00:00.
 */
export function parseRfc3339(value) {
  if (typeof value !== "string") return null;
  const match = RFC3339.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const zone = match[8];
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [0, 31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month];

  if (
    maximumDay === undefined
    || day < 1
    || day > maximumDay
    || hour > 23
    || minute > 59
    || second > 60
  ) return null;

  let offsetMinutes = 0;
  if (zone !== "Z" && zone !== "z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offsetMinutes = (offsetHour * 60 + offsetMinute) * (zone[0] === "+" ? 1 : -1);
  }

  const localDay = BigInt(daysFromCivil(year, month, day));
  const wholeSeconds = localDay * SECONDS_PER_DAY
    + BigInt(hour * 3_600 + minute * 60 + second)
    - BigInt(offsetMinutes * 60);
  const leapSecond = second === 60;

  if (leapSecond) {
    if (positiveRemainder(wholeSeconds, SECONDS_PER_DAY) !== 0n) return null;
    const boundaryDay = floorDivision(wholeSeconds, SECONDS_PER_DAY);
    if (!LEAP_SECOND_BOUNDARY_DAYS.has(String(boundaryDay))) return null;
  }

  return Object.freeze({
    wholeSeconds,
    phase: leapSecond ? 0 : 1,
    fraction,
  });
}

function compareFractions(left, right) {
  const width = Math.max(left.length, right.length);
  const leftPadded = left.padEnd(width, "0");
  const rightPadded = right.padEnd(width, "0");
  if (leftPadded < rightPadded) return -1;
  if (leftPadded > rightPadded) return 1;
  return 0;
}

/** Return -1, 0, or 1, or null when either value is outside the profile. */
export function compareRfc3339(left, right) {
  const leftTime = parseRfc3339(left);
  const rightTime = parseRfc3339(right);
  if (leftTime === null || rightTime === null) return null;
  if (leftTime.wholeSeconds < rightTime.wholeSeconds) return -1;
  if (leftTime.wholeSeconds > rightTime.wholeSeconds) return 1;
  if (leftTime.phase < rightTime.phase) return -1;
  if (leftTime.phase > rightTime.phase) return 1;
  return compareFractions(leftTime.fraction, rightTime.fraction);
}
