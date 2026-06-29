import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Search = { d?: string; table?: string };

async function getBar(barId: string) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data } = await supabase
    .from("bars")
    .select("name, menu_url, active, expires_at")
    .eq("id", barId)
    .single();
  return data;
}

export default async function VenueLanding({
  params,
  searchParams,
}: {
  params: { bar: string };
  searchParams: Search;
}) {
  const barId = params.bar;
  const token = searchParams.d ?? "";
  const table = searchParams.table ?? "";
  const bar = await getBar(barId);

  const expired = bar?.expires_at ? new Date(bar.expires_at) < new Date() : false;
  const closed = !bar || bar.active === false || expired;

  const chatHref = `/?b=${encodeURIComponent(barId)}&d=${encodeURIComponent(token)}${
    table ? `&table=${encodeURIComponent(table)}` : ""
  }`;

  return (
    <main className="min-h-dvh bg-black text-white flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />

      <div className="relative w-full max-w-sm text-center">
        <div className="text-5xl mb-3">🍻</div>
        <h1 className="text-2xl font-black">{bar?.name ?? "Welcome"}</h1>
        {table && <p className="text-white/50 text-sm mt-1">โต๊ะ {table}</p>}

        {closed ? (
          <p className="mt-10 text-white/60">
            ขออภัย ขณะนี้ร้านปิดให้บริการแอปชั่วคราว 🙏
          </p>
        ) : (
          <div className="mt-10 space-y-4">
            {bar?.menu_url && (
              <a
                href={bar.menu_url}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-2xl py-5 font-bold text-lg bg-white/10 border border-white/15 active:scale-[0.98] transition"
              >
                🍽️ ดูเมนู / สั่งอาหาร
              </a>
            )}
            <Link
              href={chatHref}
              className="block w-full rounded-2xl py-5 font-bold text-lg text-black
                         bg-gradient-to-r from-cyan-400 to-fuchsia-400
                         shadow-[0_0_24px_rgba(34,211,238,0.5)] active:scale-[0.98] transition"
            >
              💘 คุย & จับคู่ในร้าน
            </Link>
          </div>
        )}

        <p className="mt-10 text-[11px] text-white/40">
          ทุกอย่างเป็นแบบไม่ระบุตัวตน และลบทิ้งหลังร้านปิด
        </p>
      </div>
    </main>
  );
}
