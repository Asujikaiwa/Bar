"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RadarLobby from "@/components/RadarLobby";
import type { Patron } from "@/lib/supabase/client";

export default function LobbyPage() {
  const router = useRouter();
  const [me, setMe] = useState<Patron | null>(null);
  const [barId, setBarId] = useState("demo");

  useEffect(() => {
    const raw = sessionStorage.getItem("patron");
    if (!raw) {
      router.replace("/"); // no session → back to onboarding
      return;
    }
    const u = JSON.parse(raw);
    setBarId(sessionStorage.getItem("barId") || "demo");
    setMe({
      user_id: u.id,
      nickname: u.nickname,
      gender: u.gender,
      avatar_seed: u.avatar_seed,
      table_no: u.table_no ?? null,
    });
  }, [router]);

  if (!me) return null;
  return <RadarLobby me={me} barId={barId} />;
}
