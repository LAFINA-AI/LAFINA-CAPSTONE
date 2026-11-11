/**
 * Schedule Parser for On-Device Scanned Timetables, Syllabi, and USTP CORs.
 *
 * Extracts subjects, days of the week, start/end times, and room locations
 * from OCR text, and formats them into a clean Markdown table and Calendar drafts.
 */

export interface ScannedClassItem {
  id: string;
  subject: string;
  days: string[];
  startTime: string; // HH:mm (24-hour)
  endTime: string;   // HH:mm (24-hour)
  startTime12: string; // e.g. "9:00 AM"
  endTime12: string;   // e.g. "10:30 AM"
  room?: string;
  recurrenceRule: string; // e.g. 'FREQ=WEEKLY;UNTIL=20270317T235959Z'
  rawText: string;
}

export interface ParsedScheduleResult {
  classes: ScannedClassItem[];
  markdownTable: string;
  rawText: string;
  commandSummary: string;
  semesterEndDate: string; // YYYYMMDDThhmmssZ
}

const DAY_MAP: Record<string, string> = {
  m: 'Monday',
  mon: 'Monday',
  monday: 'Monday',
  t: 'Tuesday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  w: 'Wednesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  r: 'Thursday',
  th: 'Thursday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  f: 'Friday',
  fri: 'Friday',
  friday: 'Friday',
  s: 'Saturday',
  sat: 'Saturday',
  saturday: 'Saturday',
  sun: 'Sunday',
  sunday: 'Sunday',
};

/**
 * Calculates a semester end cut-off timestamp (default ~18 weeks / 126 days from refDate)
 * formatted for iCalendar RRULE UNTIL clause: YYYYMMDDTHHMMSSZ.
 */
export function computeSemesterEndDate(refDate: Date = new Date(), weeks: number = 18): string {
  const until = new Date(refDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const yyyy = until.getUTCFullYear();
  const mm = String(until.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(until.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T235959Z`;
}

/**
 * Normalizes day strings like "MWF", "TTH", "TF", "TR", "M-W-F", "Mon/Wed" into full day names.
 */
export function expandDays(dayStr: string): string[] {
  const clean = dayStr.trim();
  const upper = clean.toUpperCase().replace(/[\s\-/]/g, '');

  if (upper === 'MWF') return ['Monday', 'Wednesday', 'Friday'];
  if (upper === 'MW') return ['Monday', 'Wednesday'];
  if (upper === 'TTH' || upper === 'T-TH' || upper === 'TR' || upper === 'T-R') return ['Tuesday', 'Thursday'];
  if (upper === 'TF' || upper === 'T-F') return ['Tuesday', 'Friday'];
  if (upper === 'FS' || upper === 'FRI-SAT') return ['Friday', 'Saturday'];
  if (upper === 'MTWTH') return ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
  if (upper === 'MTWTHF') return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (upper === 'M' || upper === 'MON') return ['Monday'];
  if (upper === 'T' || upper === 'TUE') return ['Tuesday'];
  if (upper === 'W' || upper === 'WED') return ['Wednesday'];
  if (upper === 'R' || upper === 'TH' || upper === 'THU') return ['Thursday'];
  if (upper === 'F' || upper === 'FRI') return ['Friday'];
  if (upper === 'S' || upper === 'SAT') return ['Saturday'];
  if (upper === 'SU' || upper === 'SUN') return ['Sunday'];

  const tokens = clean.replace(/[/\-,]/g, ' ').split(/\s+/);
  const result: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (DAY_MAP[key] && !result.includes(DAY_MAP[key])) {
      result.push(DAY_MAP[key]);
    }
  }
  return result.length > 0 ? result : ['Monday'];
}

/**
 * Converts 12-hour or 24-hour time string into standard 24h "HH:mm" and 12h display.
 * Robust against OCR mistakes like letter 'O' instead of 0, and dots instead of colons (3.00 PM).
 */
export function normalizeTime24(timeStr: string): { time24: string; time12: string } | null {
  // Clean OCR common mistakes: letter 'O'/'o' instead of '0', dots instead of colons
  const cleaned = timeStr.trim().replace(/o/gi, '0');
  const match = cleaned.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  if (minute < 0 || minute > 59) return null;

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  if (hour < 0 || hour > 23) return null;

  const hh = hour.toString().padStart(2, '0');
  const mm = minute.toString().padStart(2, '0');

  const dispHour = hour % 12 || 12;
  const dispPeriod = hour >= 12 ? 'PM' : 'AM';
  const time12 = `${dispHour}:${mm} ${dispPeriod}`;

  return { time24: `${hh}:${mm}`, time12 };
}

/**
 * Checks if a line is a pure day header like "mon", "tue", "Wednesday", etc.
 */
function checkDayHeader(line: string): string | null {
  const trimmed = line.trim();
  if (/\d/.test(trimmed)) return null;

  const match = trimmed.match(
    /^(?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)$/i,
  );
  if (!match) return null;

  const days = expandDays(trimmed);
  return days.length > 0 ? days[0] : null;
}

/**
 * Checks if a line is a document title or table column header to ignore as a subject.
 */
function isDocumentHeader(line: string): boolean {
  const upper = line.toUpperCase().trim();
  if (/WEEKLY\s+CLASS\s+SCHEDULE/i.test(upper)) return true;
  if (/CLASS\s+SCHEDULE/i.test(upper)) return true;
  if (/CERTIFICATE\s+OF\s+REGISTRATION/i.test(upper)) return true;
  if (/STUDENT\s+(?:SCHEDULE|REGISTRATION|INFORMATION)/i.test(upper)) return true;
  if (/CODE\s*\|?\s*SUBJECT(?:\s*TITLE)?/i.test(upper)) return true;
  if (/SCHEDULE\s*\/?\s*ROOM/i.test(upper)) return true;
  if (/ACADEMIC\s+YEAR/i.test(upper)) return true;
  if (/ENROLLED\s+COURSES/i.test(upper)) return true;
  return false;
}

/**
 * Checks if a string is an invalid subject name (e.g. time fragment "PM - 4", "AM - 1", or pure day code).
 */
function isInvalidSubject(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed || trimmed.length < 2) return true;
  if (/^(?:AM|PM)\s*[-–—]?\s*\d+/i.test(trimmed)) return true;
  if (/^\d{1,2}[:.]\d{2}/.test(trimmed)) return true;
  if (/^(?:MWF|TTH|MW|TF|FS|TR|MON|TUE|WED|THU|FRI|SAT|SUN|M|T|W|R|TH|F|S|SU)$/i.test(trimmed)) return true;
  if (/^(?:Room|Rm\.?|Modular|Building|Bldg)\b/i.test(trimmed) && !/Elective|Issues|Society|Computing|Math/i.test(trimmed)) {
    return true;
  }
  return false;
}

// Subject code regex: e.g. "CS 101", "MATH 201", "ENG 102", "IT 211", "PHYS 101"
const REAL_SUBJECT_CODE_REGEX = /\b(?!(?:AM|PM|RM|TBA|MON|TUE|WED|THU|FRI|SAT|SUN|TF|MW|MWF|TTH|FS|TR)\b)([A-Z]{2,5})\s*[-]?\s*(\d{1,4}[A-Za-z]?)\b/i;

/**
 * Extracts class schedule entries from OCR text.
 */
  export function parseScannedSchedule(ocrText: string, referenceDate: Date = new Date()): ParsedScheduleResult {
    const rawLines = ocrText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const classes: ScannedClassItem[] = [];

    // Time span regex supporting colons, dots, spaces, dashes: e.g. "9:00 AM - 10:30 AM", "11.30 AM - 1.00 PM"
    const timeSpanRegex = /(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/i;
    const dayPrefixRegex = /\b(MWF|TTH|MW|TF|FS|TR|MTWTH|MTWTHF|M|T|W|R|TH|F|S|SU|MON|TUE|WED|THU|FRI|SAT|SUN|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;

    const semesterEndDate = computeSemesterEndDate(referenceDate, 18);
    const recurrenceRule = `FREQ=WEEKLY;UNTIL=${semesterEndDate}`;

    let currentSectionDay: string | null = null;
    let lastSubjectCandidate = '';
    let counter = 0;

    // Detect if top lines have a clustered list of days (columnar reading)
    const clusteredDaysQueue: string[] = [];
    let isClusteredDaysHeader = false;
    let clusterEndIndex = -1;
    let consecutiveDays = 0;
    for (let idx = 0; idx < Math.min(10, rawLines.length); idx++) {
      const day = checkDayHeader(rawLines[idx]);
      if (day) {
        clusteredDaysQueue.push(day);
        consecutiveDays++;
        clusterEndIndex = idx;
      }
    }
    if (consecutiveDays >= 3) {
      isClusteredDaysHeader = true;
    }
    let clusteredDayIndex = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];

      // If day headers are clustered at the top, skip those lines and use the queue
      if (isClusteredDaysHeader && i <= clusterEndIndex) {
        continue;
      }

      // 1. Check for day header lines (e.g. "mon", "tue", "Wednesday")
      const dayHeader = checkDayHeader(line);
      if (dayHeader) {
        currentSectionDay = dayHeader;
        lastSubjectCandidate = '';
        continue;
      }

      // 2. Skip general document header titles
      if (isDocumentHeader(line)) {
        continue;
      }

      // 3. Check for time span in this line
      const timeMatch = line.match(timeSpanRegex);

      if (timeMatch && timeMatch.index !== undefined) {
        let startStr = timeMatch[1].trim();
        let endStr = timeMatch[2].trim();

            const startHasPeriod = /am|pm/i.test(startStr);
            const endHasPeriod = /am|pm/i.test(endStr);
            const startH = parseInt(startStr.replace(/[^\d]/g, '').slice(0, 2), 10);
            const endH = parseInt(endStr.replace(/[^\d]/g, '').slice(0, 2), 10);

            // Handle cross-noon and period inheritance
            if (!startHasPeriod && endHasPeriod) {
              const period = endStr.match(/am|pm/i)![0].toLowerCase();
              if (period === 'pm') {
                // If start is morning hours (8-11) and end is afternoon (1-5), start was AM
                if (startH >= 8 && startH <= 11 && endH < 12) {
                  startStr = `${startStr} AM`;
                } else {
                  startStr = `${startStr} PM`;
                }
              } else {
                startStr = `${startStr} AM`;
              }
            } else if (!startHasPeriod && !endHasPeriod) {
              if (startH >= 7 && startH <= 11 && endH >= 1 && endH <= 9) {
                startStr = `${startStr} AM`;
                endStr = `${endStr} PM`;
              } else if (startH >= 12 || startH <= 6) {
                startStr = `${startStr} PM`;
                endStr = `${endStr} PM`;
              } else {
                startStr = `${startStr} AM`;
                endStr = `${endStr} AM`;
              }
            }

            const startNorm = normalizeTime24(startStr);
            const endNorm = normalizeTime24(endStr);

            if (startNorm && endNorm) {
              const prefix = line.slice(0, timeMatch.index).trim();
              const suffix = line.slice(timeMatch.index + timeMatch[0].length).trim();

              // --- Room Extraction ---
              let room: string | undefined;
              let cleanSuffix = suffix.replace(/^[/\-–—|,:;\s]+/, '').trim();
              if (cleanSuffix.includes('|')) {
                cleanSuffix = cleanSuffix.split('|')[0].trim();
              }
              if (cleanSuffix.length >= 2 && !/^(?:am|pm|mon|tue|wed|thu|fri|sat|sun)$/i.test(cleanSuffix)) {
                room = cleanSuffix;
              }

              // --- Day Resolution ---
              let assignedDays: string[] = [];

              // Check if prefix has day tokens like "TF", "T", "W", "F", "S", "MWF", "TR"
              const prefixDayMatch = prefix.match(dayPrefixRegex);
              if (prefixDayMatch) {
                const daysFromPrefix = expandDays(prefixDayMatch[0]);
                if (currentSectionDay && daysFromPrefix.includes(currentSectionDay)) {
                  // Under section "fri" with "TF", this specific session belongs to Friday
                  assignedDays = [currentSectionDay];
                } else {
                  assignedDays = daysFromPrefix;
                }
              } else if (currentSectionDay) {
                assignedDays = [currentSectionDay];
              } else if (isClusteredDaysHeader && clusteredDayIndex < clusteredDaysQueue.length) {
                assignedDays = [clusteredDaysQueue[clusteredDayIndex]];
                clusteredDayIndex++;
              } else {
                assignedDays = ['Monday'];
              }

              // --- Subject Extraction ---
              let subject = '';

              // Check if prefix contains subject before the day token
              let prefixWithoutDays = prefix;
              if (prefixDayMatch && prefixDayMatch.index !== undefined) {
                prefixWithoutDays = prefix.slice(0, prefixDayMatch.index).trim();
              }
              prefixWithoutDays = prefixWithoutDays.replace(/[|/\-–—,:;]+$/, '').trim();

              if (prefixWithoutDays.length >= 3 && !isInvalidSubject(prefixWithoutDays)) {
                // If prefix has a course code like "CS 101 Intro to Computing", extract code if present
                const codeMatch = prefixWithoutDays.match(REAL_SUBJECT_CODE_REGEX);
                if (codeMatch && prefixWithoutDays.startsWith(codeMatch[0])) {
                  subject = codeMatch[0].replace(/\s+/g, ' ').toUpperCase();
                } else {
                  subject = prefixWithoutDays;
                }
              } else if (lastSubjectCandidate && !isInvalidSubject(lastSubjectCandidate)) {
                subject = lastSubjectCandidate;
              } else {
                // Check preceding lines if available
                let foundSubject = '';
                for (let back = i - 1; back >= Math.max(0, i - 3); back--) {
                  const prev = rawLines[back].trim();
                  if (
                    !checkDayHeader(prev) &&
                    !isDocumentHeader(prev) &&
                    !timeSpanRegex.test(prev) &&
                    !isInvalidSubject(prev) &&
                    prev.length >= 3
                  ) {
                    foundSubject = prev;
                    break;
                  }
                }
                subject = foundSubject || `Class ${counter + 1}`;
              }

              // Clean subject of pipe chars or leading numbers/dashes
              subject = subject.replace(/^[|/\-–—,:;\s]+|[|/\-–—,:;\s]+$/g, '').trim();

              counter += 1;
              classes.push({
                id: `scanned-class-${counter}-${Date.now().toString(36)}`,
                subject,
                days: assignedDays,
                startTime: startNorm.time24,
                endTime: endNorm.time24,
                startTime12: startNorm.time12,
                endTime12: endNorm.time12,
                room: room || 'TBA',
                recurrenceRule,
                rawText: line,
              });

              lastSubjectCandidate = '';
              continue;
            }
          }

          // 4. If line does not have a time span, it could be a subject candidate
          if (
            !checkDayHeader(line) &&
            !isDocumentHeader(line) &&
            !isInvalidSubject(line) &&
            line.length >= 3
          ) {
            lastSubjectCandidate = line;
          }
        }

        // Deduplicate exact duplicate items (same subject, day, startTime, endTime)
        const uniqueClasses: ScannedClassItem[] = [];
        const seenKeys = new Set<string>();

        for (const c of classes) {
          const dayKey = [...c.days].sort().join(',');
          const key = `${c.subject.toLowerCase()}|${dayKey}|${c.startTime}|${c.endTime}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueClasses.push(c);
          }
        }

        // Format Markdown summary table
        let markdownTable = '';
        if (uniqueClasses.length > 0) {
          markdownTable = [
            '### 📅 Scanned Class Schedule',
            '',
            '| Subject | Days | Time | Room |',
            '| :--- | :--- | :--- | :--- |',
            ...uniqueClasses.map(
              c =>
                `| **${c.subject}** | ${c.days.map(d => d.slice(0, 3)).join(', ')} | ${c.startTime12} – ${c.endTime12} | ${c.room || 'TBA'} |`,
            ),
            '',
            `*Detected ${uniqueClasses.length} recurring class${uniqueClasses.length > 1 ? 'es' : ''} from your schedule.*`,
          ].join('\n');
        } else {
          markdownTable = [
            '### 📄 Scanned Document Text',
            '',
            ocrText.length > 500 ? `${ocrText.slice(0, 500)}...` : ocrText,
            '',
            '*No clear timetable grid with times and subjects was recognized in this image.*',
          ].join('\n');
        }

        // Command summary for calendar review proposals
        const commandSummary = uniqueClasses
          .map(
            c =>
              `Add time block "${c.subject}" on ${c.days.join(', ')} from ${c.startTime} to ${c.endTime}${c.room && c.room !== 'TBA' ? ` at ${c.room}` : ''} (repeats weekly)`,
          )
          .join(' and ');

        return {
          classes: uniqueClasses,
          markdownTable,
          rawText: ocrText,
          commandSummary,
          semesterEndDate,
        };
      }
