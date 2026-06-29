"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { staffLogin, staffAuthed, serveOrder } from "../actions";

type Order = {
  id: string;
  from_nick: string;
  to_nick: string | null;
  to_table: string | null;
  drink: string;
  status: string;
  created_at: string;
};

export default function StaffPage() {
  const { bar } = useParams<{ bar: string }>();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    staffAuthed().then((r) => setAuthed(r.authed));
  }, []);

  // load + subscribe to pending orders for this bar
  useEffect(() => {
    if (!authed) return;
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("drink_orders")
        .select("*")
        .eq("bar_id", bar)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (active) setOrders((data as Order[]) ?? []);
    }
    load();

    const channel = supabase
      .channel(`drinks:${bar}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drink_orders", filter: `bar_id=eq.${bar}` },
        () => load()
      )
      .subscribe();
    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [authed, bar]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await staffLogin(password);
    if (!r.ok) return setError(r.error);
    setAuthed(true);
  }

  async function markServed(id: string) {
    setOrders((prev) => prev.filter((o) => o.id !== id)); // optimistic
    await serveOrder(id);
  }

  if (authed === false) {
    return (
      <main className="min-h-dvh bg-black text-white flex items-center justify-center px-6">
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
          <h1 className="text-2xl font-black text-center">Staff 🍹</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Staff password"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-cyan-400"
            autoFocus
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="w-full rounded-xl py-3 font-bold text-black bg-gradient-to-r from-cyan-400 to-fuchsia-400">
            Sign in
          </button>
        </form>
      </main>
    );
  }
  if (authed === null) return <main className="min-h-dvh bg-black" />;

  return (
    <main className="min-h-dvh bg-black text-white px-4 py-5 max-w-xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black">ออเดอร์เครื่องดื่ม 🍹</h1>
        <span className="text-sm text-white/50">{orders.length} รอเสิร์ฟ</span>
      </header>

      {orders.length === 0 && (
        <p className="text-center text-white/40 mt-20">ยังไม่มีออเดอร์ — หน้าจอนี้จะเด้งเองเมื่อมีคนสั่ง</p>
      )}

      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
            <div className="text-3xl">{o.drink.match(/\p{Emoji}/u)?.[0] ?? "🍹"}</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg">
                {o.drink}
                {o.to_table && <span className="ml-2 text-cyan-400">→ โต๊ะ {o.to_table}</span>}
              </p>
              <p className="text-sm text-white/50">
                จาก {o.from_nick}{o.to_nick ? ` ส่งให้ ${o.to_nick}` : ""}
              </p>
            </div>
            <button
              onClick={() => markServed(o.id)}
              className="px-4 py-2 rounded-full font-bold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 active:scale-95"
            >
              เสิร์ฟแล้ว
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
