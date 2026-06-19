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
  "เหี้ย", "สัส", "ส้นตีน", "ควย", "หี", "เย็ด", "แม่ง", "มึง", "กู", "ไอ้สัตว์",
  "เงี่ยน", "ดอกทอง", "กระหรี่", "พ่อง", "ระยำ", "ชาติชั่ว",
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

export function containsProfanity(text: string): boolean {
  const norm = normalize(text);
  return BLOCKLIST.some((w) => norm.includes(normalize(w)));
}

// Mask offending words with asterisks while keeping the rest of the message.
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
