"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Uses anon key — RLS enforces all access rules.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Deterministic anonymous avatar from a seed (no real photos).
// Uses DiceBear (open-source) — swap for any avatar service you like.
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

// Drink menu for the "send a drink 🍹" feature
export const DRINKS = [
  "เบียร์ 🍺",
  "ค็อกเทล 🍸",
  "ช็อต 🥃",
  "ไวน์ 🍷",
  "แชมเปญ 🥂",
  "น้ำผลไม้ 🧃",
] as const;
