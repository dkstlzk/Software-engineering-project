/**
 * Parser Service
 * Robust slot string parser that handles messy real-world academic data
 * 
 * Supports formats like:
 *   "A"                    → { slotCode: "A", dayConstraints: [] }
 *   "B (Tue)"              → { slotCode: "B", dayConstraints: ["Tue"] }
 *   "Only for Tuesday"     → { slotCode: null, dayConstraints: ["Tue"] }
 *   "D (Mon, Fri)"         → { slotCode: "D", dayConstraints: ["Mon", "Fri"] }
 *   "Slot is N"            → { slotCode: "N", dayConstraints: [] }
 *   "K (IE/EM)"            → { slotCode: "K", dayConstraints: [] }
 *   "F (MA) (IB/CY)"       → { slotCode: "F", dayConstraints: [] }
 */

const DAY_MAP = {
    'monday': 'Mon', 'mon': 'Mon',
    'tuesday': 'Tue', 'tue': 'Tue', 'tues': 'Tue',
    'wednesday': 'Wed', 'wed': 'Wed',
    'thursday': 'Thu', 'thu': 'Thu', 'thur': 'Thu', 'thurs': 'Thu',
    'friday': 'Fri', 'fri': 'Fri',
    'saturday': 'Sat', 'sat': 'Sat',
    'sunday': 'Sun', 'sun': 'Sun',
};

const DAY_NAMES = Object.keys(DAY_MAP);

class ParserService {
    /**
     * Parse a slot string from timetable input
     * @param {string} rawSlot - Raw slot string from CSV/Excel
     * @returns {Object} { slotCode, dayConstraints, rawAnnotations }
     */
    parseSlotString(rawSlot) {
        if (!rawSlot || typeof rawSlot !== 'string') {
            return { slotCode: null, dayConstraints: [], rawAnnotations: '' };
        }

        const original = rawSlot.trim();
        let slotCode = null;
        let dayConstraints = [];

        // Extract day names from anywhere in the string
        dayConstraints = this.extractDays(original);

        // Try to extract slot code using various patterns
        slotCode = this.extractSlotCode(original);

        return {
            slotCode,
            dayConstraints,
            rawAnnotations: original,
        };
    }

    /**
     * Extract day names from a string
     * @param {string} str
     * @returns {string[]} Normalized day names
     */
    extractDays(str) {
        const days = [];
        const lower = str.toLowerCase();

        // Match day names (full or abbreviated)
        for (const [key, normalized] of Object.entries(DAY_MAP)) {
            // Use word boundary matching to avoid false positives
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(lower) && !days.includes(normalized)) {
                days.push(normalized);
            }
        }

        return days;
    }

    /**
     * Extract the primary slot code from a raw slot string
     * Handles: "A", "B (Tue)", "Slot is N", "K (IE/EM)", "F (MA) (IB/CY)"
     * @param {string} str
     * @returns {string|null}
     */
    extractSlotCode(str) {
        if (!str) return null;

        // Pattern 1: "Slot is X" or "slot: X"
        const slotIsMatch = str.match(/slot\s+(?:is|:)\s*([A-Z][A-Z0-9]*)/i);
        if (slotIsMatch) {
            return slotIsMatch[1].toUpperCase();
        }

        // Pattern 2: "Only for <day>" — no slot code, just day constraint
        if (/^only\s+for\s+/i.test(str)) {
            return null;
        }

        // Pattern 3: Leading slot code before parentheses or end of string
        // Matches: "A", "B (Tue)", "K (IE/EM)", "M1", "F (MA) (IB/CY)"
        const leadingMatch = str.match(/^([A-Z][A-Z0-9]*)/i);
        if (leadingMatch) {
            return leadingMatch[1].toUpperCase();
        }

        return null;
    }

    /**
     * Parse a full timetable row
     * @param {Object} row - { subject_code, subject_name, slot, instructor, student_count, classroom }
     * @returns {Object} Parsed row with normalized fields
     */
    parseTimetableRow(row) {
        const parsed = this.parseSlotString(row.slot);

        return {
            subjectCode: (row.subject_code || '').trim(),
            subjectName: (row.subject_name || '').trim(),
            slotCode: parsed.slotCode,
            slotConstraints: {
                dayConstraints: parsed.dayConstraints,
                rawAnnotations: parsed.rawAnnotations,
            },
            instructor: (row.instructor || '').trim(),
            studentCount: parseInt(row.student_count) || 0,
            classroom: (row.classroom || '').trim() || null,
            rawInput: JSON.stringify(row),
        };
    }
}

module.exports = new ParserService();
