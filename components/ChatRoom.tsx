"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, avatarUrl, type Patron } from "@/lib/supabase/client";
import { sendMessage, reportUser } from "@/app/actions";

type Message = {
  id: string;
  match_id: string;
  sender: string;
  body: string;
  created_at: string;
};

type Other = { id: string; nickname: string; gender: string; avatar_seed: string };

export default function ChatRoom({ me, matchId }: { me: Patron; matchId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Other | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load match + the other participant + message history
  useEffect(() => {
    (async () => {
      const { data: match } = await supabase
        .from("matches")
        .select("requester, target, status")
        .eq("id", matchId)
        .single();
      if (!match || match.status !== "matched") {
        setBanner("This chat is no longer available.");
        return;
      }
      const otherId = match.requester === me.user_id ? match.target : match.requester;
      const { data: u } = await supabase
        .from("users")
        .select("id, nickname, gender, avatar_seed")
        .eq("id", otherId)
        .single();
      if (u) setOther(u as Other);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });
      setMessages((msgs as Message[]) ?? []);
    })();
  }, [matchId, me.user_id]);

  // Realtime: receive new messages
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as Message;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [matchId]);

  // autoscroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    const res = await sendMessage(matchId, body);
    setSending(false);
    if (!res.ok) {
      setBanner(res.error);
      setText(body); // restore on failure
    } else if (res.flagged) {
      setBanner("Some words were hidden to keep things friendly.");
      setTimeout(() => setBanner(null), 3000);
    }
  }

  async function handleReport() {
    if (!other) return;
    setMenuOpen(false);
    await reportUser(other.id, "inappropriate");
    setBanner(`You reported & blocked ${other.nickname}. Leaving chat…`);
    setTimeout(() => router.replace("/lobby"), 1500);
  }

  return (
    <main className="min-h-dvh bg-black text-white flex flex-col">
      {/* header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 sticky top-0 bg-black/80 backdrop-blur z-10">
        <button onClick={() => router.replace("/lobby")} className="text-white/60 text-xl px-1" aria-label="Back">
          ‹
        </button>
        {other && <img src={avatarUrl(other.avatar_seed)} alt="" className="h-9 w-9 rounded-full ring-2 ring-fuchsia-400/60" />}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{other?.nickname ?? "…"}</p>
          <p className="text-[11px] text-emerald-400">matched 🍻</p>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="text-white/60 px-2 text-xl" aria-label="Options">
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-xl bg-zinc-900 border border-white/10 shadow-xl overflow-hidden">
              <button
                onClick={handleReport}
                className="w-full text-left px-4 py-3 text-sm text-rose-400 hover:bg-white/5"
              >
                🚫 Block & Report
              </button>
            </div>
          )}
        </div>
      </header>

      {banner && (
        <div className="px-4 py-2 text-center text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          {banner}
        </div>
      )}

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-white/40 text-sm mt-10">
            You matched! Say hi 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender === me.user_id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] px-4 py-2 rounded-2xl text-[15px] leading-snug
                  ${mine
                    ? "bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white rounded-br-sm"
                    : "bg-white/10 text-white rounded-bl-sm"}`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-white/10 bg-black sticky bottom-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Type a message…"
          className="flex-1 rounded-full bg-white/5 border border-white/10 px-4 py-3 outline-none
                     focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 transition"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-full px-5 py-3 font-bold text-black bg-gradient-to-r from-cyan-400 to-fuchsia-400
                     disabled:opacity-40 active:scale-95 transition"
        >
          Send
        </button>
      </form>
    </main>
  );
}
