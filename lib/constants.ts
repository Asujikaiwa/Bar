// Shared constants/types used by BOTH server actions and client components.
// Kept free of the "use client" directive so server code can import it.

// Deterministic anonymous avatar from a seed (no real photos).
export function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

export const GENDERS = [
  { value: "male", label: "Male", glow: "shadow-[0_0_18px] shadow-cyan-500/60", ring: "ring-cyan-400" },
  { value: "female", label: "Female", glow: "shadow-[0_0_18px] shadow-pink-500/60", ring: "ring-pink-400" },
  { value: "lgbtq", label: "LGBTQ+", glow: "shadow-[0_0_18px] shadow-fuchsia-500/60", ring: "ring-fuchsia-400" },
] as const;

export type Gender = (typeof GENDERS)[number]["value"];

export type Patron = {
  user_id: string;
  nickname: string;
  gender: Gender;
  avatar_seed: string;
  table_no?: string | null;
};

// Drink menu for the "send a drink" feature. The server validates against this
// list, so a tampered client cannot invent its own items.
export const DRINKS = [
  "เบียร์ 🍺",
  "ค็อกเทล 🍸",
  "ช็อต 🥃",
  "ไวน์ 🍷",
  "แชมเปญ 🥂",
  "น้ำผลไม้ 🧃",
] as const;
