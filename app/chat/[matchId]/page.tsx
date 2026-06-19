"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ChatRoom from "@/components/ChatRoom";
import type { Patron } from "@/lib/supabase/client";

export default function ChatPage() {
  const router = useRouter();
  const { matchId } = useParams<{ matchId: string }>();
  const [me, setMe] = useState<Patron | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("patron");
    if (!raw) {
      router.replace("/");
      return;
    }
    const u = JSON.parse(raw);
    setMe({ user_id: u.id, nickname: u.nickname, gender: u.gender, avatar_seed: u.avatar_seed });
  }, [router]);

  if (!me) return null;
  return <ChatRoom me={me} matchId={matchId} />;
}
