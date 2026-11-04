"use client";

import { useEffect, useRef, useState } from "react";

/**
 * หน้าโหลดตอนเข้า — โชว์โลโก้นีออน หมุน/เรืองแสง แล้ว "วาป" (ซูม+เฟด) หายไป
 * เรียกใช้: <Splash onDone={() => setBooted(true)} />
 */
export default function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  // Kept in a ref so an inline onDone prop doesn't restart the timers on every
  // re-render of the parent.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const hold = setTimeout(() => setLeaving(true), 1500); // โชว์ ~1.5 วิ
    // Safety net: if the browser never fires transitionend (tab in the
    // background, reduced motion, …) the splash would cover the app forever.
    const bail = setTimeout(() => doneRef.current(), 3000);
    return () => {
      clearTimeout(hold);
      clearTimeout(bail);
    };
  }, []);

  return (
    <div
      onTransitionEnd={() => leaving && onDone()}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black
                  transition-all duration-700 ease-in
                  ${leaving ? "opacity-0 scale-150 blur-xl pointer-events-none" : "opacity-100 scale-100"}`}
    >
      {/* แสงนีออนวงกลมหายใจ */}
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-fuchsia-600/30 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute h-56 w-56 rounded-full bg-cyan-500/30 blur-3xl animate-pulse" />

      {/* โลโก้ */}
      <div className="relative text-center animate-[splashIn_0.6s_ease-out]">
        <div className="text-7xl mb-2 animate-[clink_1.2s_ease-in-out_infinite]">🍻</div>
        <h1 className="text-4xl font-black tracking-tight">
          <span className="text-cyan-400 drop-shadow-[0_0_16px_rgba(34,211,238,0.9)]">Cheers</span>
        </h1>
        <p className="text-white/50 text-sm mt-2 tracking-widest uppercase">กำลังเข้าร้าน…</p>
      </div>

      {/* แถบโหลดนีออน */}
      <div className="relative mt-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 animate-[slide_1.2s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
