"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminLogin,
  adminLogout,
  adminAuthed,
  listBars,
  saveBar,
  deleteBar,
  searchPlaces,
  placeLocation,
  type Bar,
  type PlaceHit,
} from "./actions";

const BLANK: Bar = {
  id: "",
  name: "",
  lat: 13.7563,
  lng: 100.5018,
  radius_meters: 150,
  menu_url: "",
  active: true,
  expires_at: null,
};

function cryptoRandom() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [editing, setEditing] = useState<Bar>(BLANK);
  const [qrFor, setQrFor] = useState<Bar | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Google Places search
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionTokenRef = useRef<string>(cryptoRandom());

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const qrDivRef = useRef<HTMLDivElement>(null);

  // check existing session
  useEffect(() => {
    adminAuthed().then((r) => setAuthed(r.authed));
  }, []);

  // load bars once authed
  useEffect(() => {
    if (authed) refresh();
  }, [authed]);

  async function refresh() {
    const r = await listBars();
    if (r.ok) setBars(r.bars);
  }

  // load Leaflet + qrcode from CDN (no API key needed)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).L) {
      setLeafletReady(true);
    } else {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      js.onload = () => setLeafletReady(true);
      document.body.appendChild(js);
    }
    if (!(window as any).QRCode) {
      const qr = document.createElement("script");
      qr.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      document.body.appendChild(qr);
    }
  }, []);

  // init the map once authed + leaflet ready
  useEffect(() => {
    if (!leafletReady || !authed || !mapDivRef.current || mapRef.current) return;
    const L = (window as any).L;
    const start: [number, number] = [editing.lat, editing.lng];
    const map = L.map(mapDivRef.current).setView(start, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    const marker = L.marker(start, { draggable: true }).addTo(map);
    const circle = L.circle(start, { radius: editing.radius_meters, color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.12 }).addTo(map);

    function place(latlng: any) {
      marker.setLatLng(latlng);
      circle.setLatLng(latlng);
      setEditing((p) => ({ ...p, lat: latlng.lat, lng: latlng.lng }));
    }
    map.on("click", (e: any) => place(e.latlng));
    marker.on("dragend", (e: any) => place(e.target.getLatLng()));

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;
  }, [leafletReady, authed]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep circle in sync with radius slider
  useEffect(() => {
    circleRef.current?.setRadius(editing.radius_meters);
  }, [editing.radius_meters]);

  // render QR when overlay opens
  useEffect(() => {
    if (!qrFor || !qrDivRef.current || !(window as any).QRCode) return;
    qrDivRef.current.innerHTML = "";
    const url = `${window.location.origin}/t/${qrFor.id}`;
    new (window as any).QRCode(qrDivRef.current, { text: url, width: 240, height: 240 });
  }, [qrFor]);

  function focusMap(b: Bar) {
    if (!mapRef.current) return;
    mapRef.current.setView([b.lat, b.lng], 16);
    markerRef.current?.setLatLng([b.lat, b.lng]);
    circleRef.current?.setLatLng([b.lat, b.lng]);
    circleRef.current?.setRadius(b.radius_meters);
  }

  function startEdit(b: Bar) {
    setEditing(b);
    setSavedMsg(null);
    focusMap(b);
  }
  function startNew() {
    setEditing(BLANK);
    setSavedMsg(null);
    focusMap(BLANK);
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setEditing((p) => ({ ...p, lat, lng }));
      mapRef.current?.setView([lat, lng], 17);
      markerRef.current?.setLatLng([lat, lng]);
      circleRef.current?.setLatLng([lat, lng]);
    });
  }

  // debounced Google Places search
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setPlaceHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchPlaces(q, sessionTokenRef.current);
      setSearching(false);
      if (r.ok) setPlaceHits(r.results);
      else setError(r.error);
    }, 350);
    return () => clearTimeout(t);
  }, [placeQuery]);

  async function pickPlace(hit: PlaceHit) {
    const r = await placeLocation(hit.placeId, sessionTokenRef.current);
    sessionTokenRef.current = cryptoRandom(); // new session after a pick (billing)
    setPlaceHits([]);
    setPlaceQuery(hit.text);
    if (!r.ok) return setError(r.error);
    setEditing((p) => ({ ...p, lat: r.lat, lng: r.lng, name: p.name || r.name }));
    mapRef.current?.setView([r.lat, r.lng], 17);
    markerRef.current?.setLatLng([r.lat, r.lng]);
    circleRef.current?.setLatLng([r.lat, r.lng]);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await adminLogin(password);
    if (!r.ok) return setError(r.error);
    setAuthed(true);
  }

  async function handleSave() {
    setError(null);
    const r = await saveBar(editing);
    if (!r.ok) return setError(r.error);
    setSavedMsg(`Saved "${editing.name}" ✓`);
    await refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete bar "${id}"? Customers can no longer join via its QR.`)) return;
    await deleteBar(id);
    await refresh();
    if (editing.id === id) startNew();
  }

  // ----- Login screen -----
  if (authed === false) {
    return (
      <main className="min-h-dvh bg-black text-white flex items-center justify-center px-6">
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
          <h1 className="text-2xl font-black text-center">Admin 🔐</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
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

  // ----- Dashboard -----
  return (
    <main className="min-h-dvh bg-black text-white px-4 py-5 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black">Bars Admin 🍻</h1>
        <button
          onClick={async () => {
            await adminLogout();
            setAuthed(false);
          }}
          className="text-sm text-white/50 hover:text-white"
        >
          Log out
        </button>
      </header>

      {/* editor */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">{editing.id ? `Edit: ${editing.id}` : "New bar"}</h2>
          {editing.id && (
            <button onClick={startNew} className="text-xs text-cyan-400">+ New bar</button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Bar ID (ใช้ใน QR)</label>
            <input
              value={editing.id}
              onChange={(e) => setEditing((p) => ({ ...p, id: e.target.value }))}
              placeholder="thonglor"
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Bar name</label>
            <input
              value={editing.name}
              onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
              placeholder="My Bar Thonglor"
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Google Places search */}
        <label className="block text-xs text-white/50 mb-1">ค้นหาร้านจาก Google (พิมพ์ชื่อร้าน)</label>
        <div className="relative mb-3">
          <input
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            placeholder="เช่น ชื่อร้านเหล้าของคุณ"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-cyan-400"
          />
          {searching && <span className="absolute right-3 top-2.5 text-xs text-white/40">กำลังค้น…</span>}
          {placeHits.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl max-h-60 overflow-y-auto">
              {placeHits.map((h) => (
                <li key={h.placeId}>
                  <button
                    type="button"
                    onClick={() => pickPlace(h)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* map */}
        <p className="text-xs text-white/50 mb-2">หรือแตะบนแผนที่เพื่อปักหมุดเอง (ลากหมุดปรับได้)</p>
        <div ref={mapDivRef} className="h-72 w-full rounded-xl overflow-hidden mb-2 bg-zinc-800" />
        <div className="flex items-center justify-between text-xs text-white/50 mb-3">
          <span>📍 {editing.lat.toFixed(5)}, {editing.lng.toFixed(5)}</span>
          <button onClick={useMyLocation} className="text-cyan-400">ใช้ตำแหน่งปัจจุบัน</button>
        </div>

        {/* radius */}
        <label className="block text-xs text-white/50 mb-1">
          รัศมีที่อนุญาตให้เข้าใช้: <span className="text-white font-semibold">{editing.radius_meters} m</span>
        </label>
        <input
          type="range"
          min={20}
          max={1000}
          step={10}
          value={editing.radius_meters}
          onChange={(e) => setEditing((p) => ({ ...p, radius_meters: Number(e.target.value) }))}
          className="w-full accent-cyan-400 mb-4"
        />

        {/* menu link */}
        <label className="block text-xs text-white/50 mb-1">ลิงก์เมนู/สั่งอาหาร (ใส่หรือเว้นว่างก็ได้)</label>
        <input
          value={editing.menu_url ?? ""}
          onChange={(e) => setEditing((p) => ({ ...p, menu_url: e.target.value }))}
          placeholder="https://lin.ee/... หรือลิงก์ระบบสั่งอาหารของร้าน"
          className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-cyan-400 mb-4"
        />

        {/* billing controls */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="flex items-center gap-2 rounded-lg bg-black/40 border border-white/10 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editing.active ?? true}
              onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))}
              className="accent-emerald-400"
            />
            <span className="text-sm">เปิดใช้งานร้าน</span>
          </label>
          <div>
            <label className="block text-[11px] text-white/40 mb-1">หมดอายุ (เว้นว่าง = ไม่จำกัด)</label>
            <input
              type="date"
              value={editing.expires_at ? editing.expires_at.slice(0, 10) : ""}
              onChange={(e) => setEditing((p) => ({ ...p, expires_at: e.target.value ? `${e.target.value}T23:59:59Z` : null }))}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-400 mb-2">{error}</p>}
        {savedMsg && <p className="text-sm text-emerald-400 mb-2">{savedMsg}</p>}

        <button
          onClick={handleSave}
          className="w-full rounded-xl py-3 font-bold text-black bg-gradient-to-r from-cyan-400 to-fuchsia-400 active:scale-[0.99]"
        >
          Save bar
        </button>
      </section>

      {/* list */}
      <h2 className="font-bold mb-2">Your bars</h2>
      <ul className="space-y-2">
        {bars.length === 0 && <li className="text-white/40 text-sm">ยังไม่มีร้าน เพิ่มร้านแรกด้านบน</li>}
        {bars.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                {b.name} <span className="text-white/40 text-xs">/{b.id}</span>
                {b.active === false ? (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300">ปิด</span>
                ) : (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">เปิด</span>
                )}
              </p>
              <p className="text-xs text-white/40">
                รัศมี {b.radius_meters} m{b.expires_at ? ` · หมดอายุ ${b.expires_at.slice(0, 10)}` : ""}
              </p>
            </div>
            <a href={`/staff/${b.id}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-full bg-white/10">Staff</a>
            <button onClick={() => setQrFor(b)} className="text-xs px-3 py-1.5 rounded-full bg-white/10">QR</button>
            <button onClick={() => startEdit(b)} className="text-xs px-3 py-1.5 rounded-full bg-white/10">Edit</button>
            <button onClick={() => handleDelete(b.id)} className="text-xs px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-300">Del</button>
          </li>
        ))}
      </ul>

      {/* QR overlay */}
      {qrFor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center px-6" onClick={() => setQrFor(null)}>
          <div className="bg-white rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div ref={qrDivRef} className="flex justify-center" />
            <p className="text-black font-bold mt-3">{qrFor.name}</p>
            <p className="text-zinc-500 text-xs break-all mt-1">{typeof window !== "undefined" ? `${window.location.origin}/t/${qrFor.id}` : ""}</p>
            <p className="text-zinc-400 text-[11px] mt-2">พิมพ์ติดโต๊ะได้เลย — ลูกค้าสแกนแล้วเข้าร้านนี้</p>
          </div>
          <button onClick={() => setQrFor(null)} className="mt-4 text-white/70 text-sm">ปิด</button>
        </div>
      )}
    </main>
  );
}
