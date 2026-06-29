// Server-side profanity filter (TH + EN) — runs inside the Durable Object so a
// tampered client cannot bypass it. Extend the list to fit your venue.

const BLOCKLIST = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "slut", "whore",
  "nigger", "faggot", "retard",
  "เหี้ย", "สัส", "ส้นตีน", "ควย", "หี", "เย็ด", "แม่ง", "มึง", "กู", "ไอ้สัตว์",
  "เงี่ยน", "ดอกทอง", "กระหรี่", "พ่อง", "ระยำ", "ชาติชั่ว",
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s._\-*]+/g, "")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s");
}

function hit(token: string) {
  const norm = normalize(token);
  return BLOCKLIST.some((w) => norm.includes(normalize(w)));
}

export function maskProfanity(text: string): string {
  return text
    .split(/(\s+)/)
    .map((t) => (t.trim() && hit(t) ? "•".repeat(Math.max(t.trim().length, 3)) : t))
    .join("");
}
