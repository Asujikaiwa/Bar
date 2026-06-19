"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { joinBar } from "./actions";
import { GENDERS, avatarUrl, type Gender } from "@/lib/supabase/client";

// Fun random nickname so users can enter with a single tap (still editable).
const ADJ = ["Neon", "Midnight", "Velvet", "Electric", "Golden", "Crimson", "Lunar", "Disco", "Smoky", "Wild"];
const NOUN = ["Fox", "Tiger", "Comet", "Martini", "Phoenix", "Raven", "Lychee", "Jaguar", "Orchid", "Whiskey"];
function randomNickname() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a}${n}${Math.floor(Math.random() * 90 + 10)}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const barId = params.get("b") ?? "demo";
  const token = params.get("d") ?? "";

  const [nickname, setNickname] = useState(randomNickname);
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const previewSeed = nickname.trim() || "you";

  function getCoords(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 6000 }
      );
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!gender) return setError("Pick how you'd like to show up.");
    startTransition(async () => {
      const coords = await getCoords();
      const res = await joinBar({ barId, token, nickname, gender, coords });
      if (!res.ok) return setError(res.error);
      sessionStorage.setItem("patron", JSON.stringify(res.user));
      router.push("/lobby");
    });
  }

  return (
    <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center px-6 py-10 overflow-hidden relative">
      {/* ambient neon glow */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />

      <div className="w-full max-w-sm relative">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">Cheers</span>
            <span className="text-fuchsia-400 drop-shadow-[0_0_12px_rgba(232,121,249,0.7)]">🍻</span>
          </h1>
          <p className="text-sm text-white/60 mt-2">
            You&apos;re in the room. Pick a vibe — no name, no number, no trace after tonight.
          </p>
        </header>

        {/* live avatar preview */}
        <div className="flex justify-center mb-6">
          <img
            src={avatarUrl(previewSeed)}
            alt="Your avatar"
            className="h-24 w-24 rounded-2xl bg-white/5 ring-2 ring-white/10 p-1"
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="flex items-center justify-between text-xs uppercase tracking-widest text-white/50 mb-2">
              <span>Nickname</span>
              <button
                type="button"
                onClick={() => setNickname(randomNickname())}
                className="normal-case tracking-normal text-cyan-400 hover:text-cyan-300"
              >
                🎲 Shuffle
              </button>
            </label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              placeholder="e.g. NeonFox"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-lg
                         outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40 transition"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-white/50 mb-2">
              I&apos;m...
            </label>
            <div className="grid grid-cols-3 gap-3">
              {GENDERS.map((g) => {
                const active = gender === g.value;
                return (
                  <button
                    type="button"
                    key={g.value}
                    onClick={() => setGender(g.value)}
                    className={`rounded-xl py-3 text-sm font-semibold border transition
                      ${active
                        ? `bg-white/10 border-transparent ring-2 ${g.ring} ${g.glow}`
                        : "bg-white/5 border-white/10 text-white/70 hover:border-white/30"}`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || nickname.trim().length < 2 || !gender}
            className="w-full rounded-xl py-4 font-bold text-black text-lg
                       bg-gradient-to-r from-cyan-400 to-fuchsia-400
                       shadow-[0_0_24px_rgba(34,211,238,0.5)]
                       disabled:opacity-40 disabled:shadow-none transition active:scale-[0.98]"
          >
            {pending ? "Walking in…" : "Enter the Bar 🍻"}
          </button>

          <p className="text-center text-[11px] text-white/40">
            Everything you do here is wiped at closing time (4:00 AM).
          </p>
        </form>
      </div>
    </main>
  );
}
