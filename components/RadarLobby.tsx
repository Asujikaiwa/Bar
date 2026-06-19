"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, avatarUrl, type Patron } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const GENDER_COLOR: Record<string, string> = {
  male: "ring-cyan-400 shadow-cyan-500/50",
  female: "ring-pink-400 shadow-pink-500/50",
  lgbtq: "ring-fuchsia-400 shadow-fuchsia-500/50",
};

export default function RadarLobby({ me, barId }: { me: Patron; barId: string }) {
  const router = useRouter();
  const [patrons, setPatrons] = useState<Patron[]>([]);
  const [view, setView] = useState<"radar" | "list">("radar");
  const [cheered, setCheered] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [match, setMatch] = useState<{ matchId: string; nickname: string } | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ---- Presence: who's currently in the bar -------------------------------
  useEffect(() => {
    const channel = supabase.channel(`bar:${barId}`, {
      config: { presence: { key: me.user_id } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Patron>();
        const list = Object.values(state)
          .map((entries) => entries[0])
          .filter((p) => p && p.user_id !== me.user_id);
        setPatrons(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track(me); // announce myself
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [barId, me]);

  // ---- Cheers / Match notifications ---------------------------------------
  // RLS already limits these rows to ones I'm part of, so no extra filter needed.
  useEffect(() => {
    function onMatched(m: { id: string; requester: string; target: string }) {
      const otherId = m.requester === me.user_id ? m.target : m.requester;
      const other = patrons.find((p) => p.user_id === otherId);
      setMatch({ matchId: m.id, nickname: other?.nickname ?? "your match" });
    }

    const sub = supabase
      .channel(`matches:${me.user_id}`)
      // someone cheered me (still pending)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `target=eq.${me.user_id}` },
        (payload) => {
          const m = payload.new as { requester: string; status: string };
          if (m.status === "matched") return; // handled below
          const from = patrons.find((p) => p.user_id === m.requester);
          setToast(`${from?.nickname ?? "Someone"} sent you a Cheers 🍻 — cheers back to match!`);
          setTimeout(() => setToast(null), 5000);
        }
      )
      // my earlier cheers got reciprocated (row flipped to matched)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        (payload) => {
          const m = payload.new as { id: string; requester: string; target: string; status: string };
          if (m.status === "matched" && (m.requester === me.user_id || m.target === me.user_id)) onMatched(m);
        }
      )
      // I cheered back and it became an instant match on insert
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `requester=eq.${me.user_id}` },
        (payload) => {
          const m = payload.new as { id: string; requester: string; target: string; status: string };
          if (m.status === "matched") onMatched(m);
        }
      )
      .subscribe();
    return () => {
      sub.unsubscribe();
    };
  }, [me.user_id, patrons]);

  async function sendCheers(target: Patron) {
    if (cheered.has(target.user_id)) return;
    setCheered((s) => new Set(s).add(target.user_id));
    const { error } = await supabase.from("matches").insert({
      bar_id: barId,
      requester: me.user_id,
      target: target.user_id,
      status: "pending",
    });
    // If the reciprocal cheers existed, the DB trigger flips this to "matched"
    // and our realtime subscription pops the "It's a Match!" overlay.
    if (error) {
      setCheered((s) => {
        const n = new Set(s);
        n.delete(target.user_id);
        return n;
      });
      setToast("Couldn't send cheers. Try again.");
    } else {
      setToast(`Cheers sent to ${target.nickname} 🍻`);
    }
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <main className="min-h-dvh bg-black text-white relative overflow-hidden">
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-fuchsia-700/20 blur-3xl" />

      {/* header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4 relative">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">In the bar now</p>
          <h1 className="text-2xl font-black">
            {patrons.length + 1} <span className="text-white/50 text-base font-medium">people</span>
          </h1>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-full p-1 border border-white/10">
          {(["radar", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition
                ${view === v ? "bg-white/15 text-white" : "text-white/50"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {patrons.length === 0 && (
        <p className="text-center text-white/40 mt-24 px-8">
          You&apos;re the first one here. Hang tight — the radar lights up as people walk in.
        </p>
      )}

      {view === "radar" ? (
        <RadarView patrons={patrons} me={me} cheered={cheered} onCheers={sendCheers} />
      ) : (
        <ListView patrons={patrons} cheered={cheered} onCheers={sendCheers} />
      )}

      {toast && !match && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full
                        bg-white/10 backdrop-blur border border-white/20 text-sm font-semibold
                        shadow-[0_0_24px_rgba(232,121,249,0.4)]">
          {toast}
        </div>
      )}

      {/* It's a Match! overlay */}
      {match && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur px-8 text-center">
          <div className="text-6xl mb-4 animate-bounce">🍻</div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">
            It&apos;s a Match!
          </h2>
          <p className="text-white/70 mt-2">You and {match.nickname} cheered each other.</p>
          <button
            onClick={() => router.push(`/chat/${match.matchId}`)}
            className="mt-8 w-full max-w-xs rounded-xl py-4 font-bold text-black text-lg
                       bg-gradient-to-r from-cyan-400 to-fuchsia-400 shadow-[0_0_24px_rgba(34,211,238,0.5)]
                       active:scale-[0.98] transition"
          >
            Start chatting 💬
          </button>
          <button onClick={() => setMatch(null)} className="mt-3 text-sm text-white/50">
            Keep mingling
          </button>
        </div>
      )}
    </main>
  );
}

function RadarView({
  patrons, me, cheered, onCheers,
}: {
  patrons: Patron[]; me: Patron; cheered: Set<string>; onCheers: (p: Patron) => void;
}) {
  // place patrons on concentric rings deterministically by id
  const placed = useMemo(
    () =>
      patrons.map((p, i) => {
        const ring = (i % 2) + 1; // 1 or 2
        const angle = (i * 137.5 * Math.PI) / 180; // golden angle spread
        const radius = ring * 33; // % of half-size
        return {
          p,
          x: 50 + Math.cos(angle) * radius,
          y: 50 + Math.sin(angle) * radius,
        };
      }),
    [patrons]
  );

  return (
    <div className="relative mx-auto mt-4 aspect-square w-[92%] max-w-md">
      {/* rings */}
      {[1, 2, 3].map((r) => (
        <div
          key={r}
          className="absolute rounded-full border border-cyan-400/15"
          style={{ inset: `${(3 - r) * 16}%` }}
        />
      ))}
      {/* sweeping line */}
      <div className="absolute inset-0 rounded-full animate-[spin_4s_linear_infinite]
                      bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.18)_40deg,transparent_60deg)]" />

      {/* me at center */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <img src={avatarUrl(me.avatar_seed)} alt="" className="h-12 w-12 rounded-full ring-2 ring-white/70" />
        <span className="text-[10px] text-white/60">You</span>
      </div>

      {placed.map(({ p, x, y }) => (
        <button
          key={p.user_id}
          onClick={() => onCheers(p)}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group"
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <img
            src={avatarUrl(p.avatar_seed)}
            alt={p.nickname}
            className={`h-11 w-11 rounded-full ring-2 shadow-[0_0_14px] transition group-active:scale-90
              ${GENDER_COLOR[p.gender]} ${cheered.has(p.user_id) ? "opacity-50" : ""}`}
          />
          <span className="text-[10px] mt-1 text-white/80 max-w-16 truncate">{p.nickname}</span>
        </button>
      ))}
    </div>
  );
}

function ListView({
  patrons, cheered, onCheers,
}: {
  patrons: Patron[]; cheered: Set<string>; onCheers: (p: Patron) => void;
}) {
  return (
    <ul className="px-4 mt-2 space-y-2 pb-24">
      {patrons.map((p) => (
        <li
          key={p.user_id}
          className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3"
        >
          <img src={avatarUrl(p.avatar_seed)} alt="" className={`h-12 w-12 rounded-full ring-2 ${GENDER_COLOR[p.gender]}`} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{p.nickname}</p>
            <p className="text-xs text-white/40 capitalize">{p.gender}</p>
          </div>
          <button
            onClick={() => onCheers(p)}
            disabled={cheered.has(p.user_id)}
            className="px-4 py-2 rounded-full text-sm font-bold text-black
                       bg-gradient-to-r from-cyan-400 to-fuchsia-400
                       disabled:opacity-40 disabled:grayscale active:scale-95 transition"
          >
            {cheered.has(p.user_id) ? "Sent" : "Cheers 🍻"}
          </button>
        </li>
      ))}
    </ul>
  );
}
