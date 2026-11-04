// Server-side profanity filter (TH + EN). Runs in a Server Action before
// inserting a message, so a tampered client cannot bypass it.
//
// This is a starter word list — extend it to fit your venue/community.
// For heavier needs, swap in a library like `leo-profanity` (multilingual).

const BLOCKLIST = [
  // English
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "slut", "whore",
  "nigger", "faggot", "retard",
  // Thai (คำหยาบทั่วไป)
  "เหี้ย", "สัส", "ส้นตีน", "ควย", "เย็ด", "แม่ง", "ไอ้สัตว์",
  "เงี่ยน", "ดอกทอง", "กระหรี่", "พ่อง", "ระยำ", "ชาติชั่ว",
];

// Short Thai words that are substrings of perfectly normal words. Thai has no
// word boundaries, so each one carries the continuations it must NOT match
// (กู+เกิล = Google, หี+บ = a chest, ...). When a false positive turns up, add
// the continuation here instead of dropping the word from the filter.
const AMBIGUOUS: { word: string; notFollowedBy: string[] }[] = [
  { word: "กู", notFollowedBy: ["เกิล", "เกิ้ล", "รู", "ร์", "ด"] },
  { word: "หี", notFollowedBy: ["บ", "ด", "น"] },
  { word: "มึง", notFollowedBy: [] },
];

// normalize: lowercase, strip spaces/dots between letters that evade filters
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s._\-*]+/g, "")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s");
}

function escapeRe(source: string) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsProfanity(text: string): boolean {
  const norm = normalize(text);
  if (BLOCKLIST.some((w) => norm.includes(normalize(w)))) return true;
  return AMBIGUOUS.some(({ word, notFollowedBy }) => {
    const tail = notFollowedBy.length
      ? `(?!${notFollowedBy.map((s) => escapeRe(normalize(s))).join("|")})`
      : "";
    return new RegExp(`${escapeRe(normalize(word))}${tail}`).test(norm);
  });
}

// Mask offending words with dots while keeping the rest of the message.
export function maskProfanity(text: string): { clean: string; flagged: boolean } {
  let flagged = false;
  const clean = text
    .split(/(\s+)/)
    .map((token) => {
      if (token.trim() && containsProfanity(token)) {
        flagged = true;
        return "•".repeat(Math.max(token.trim().length, 3));
      }
      return token;
    })
    .join("");
  // catch words concatenated without spaces too
  if (!flagged && containsProfanity(text)) flagged = true;
  return { clean, flagged };
}
