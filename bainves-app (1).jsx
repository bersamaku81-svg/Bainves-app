import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = "https://fmtwwernvdbejufhaqgm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdHd3ZXJudmRiZWp1ZmhhcWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTExMTQsImV4cCI6MjA5NDA4NzExNH0.ykvGxd6jm2uMOEHAIaiazHo4fraJfCI1OlPUWCbHHmU";

const supabase = {
  async query(table, method = "GET", body = null, filters = "") {
    const url = `${SUPABASE_URL}/rest/v1/${table}${filters}`;
    const res = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "return=representation" : "return=representation",
      },
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },
  from(table) {
    return {
      select: (cols = "*", filters = "") => supabase.query(table, "GET", null, `?select=${cols}${filters}`),
      insert: (data) => supabase.query(table, "POST", data),
      update: (data, filters) => supabase.query(table, "PATCH", data, `?${filters}`),
      delete: (filters) => supabase.query(table, "DELETE", null, `?${filters}`),
    };
  },
};

// ============================================================
// SQL SCHEMA (shown in setup modal)
// ============================================================
const SQL_SCHEMA = `
-- ===== BAINVES FULL SCHEMA =====
-- Run this in Supabase SQL Editor

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  phone text,
  school text,
  photo text default 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop',
  referral_code text unique default substring(md5(random()::text), 1, 8),
  referred_by uuid references users(id),
  role text default 'user', -- 'user' | 'admin'
  points integer default 0,
  total_questions_answered integer default 0,
  created_at timestamptz default now()
);

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  from_user_id uuid references users(id),
  level integer not null, -- 1-10
  amount integer not null, -- in Rupiah
  package_id uuid references packages(id),
  status text default 'pending', -- pending | paid
  created_at timestamptz default now()
);

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  amount integer not null,
  bank_name text,
  account_number text,
  account_name text,
  status text default 'pending', -- pending | approved | rejected
  admin_note text,
  created_at timestamptz default now()
);

create table if not exists prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  points_required integer not null,
  total_stock integer not null,
  claimed integer default 0,
  image_url text,
  category text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists prize_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  prize_id uuid references prizes(id),
  status text default 'pending', -- pending | approved | rejected | delivered
  address text,
  created_at timestamptz default now()
);

create table if not exists quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  subject text not null,
  total_answered integer default 0,
  points_earned integer default 0,
  completed boolean default false,
  created_at timestamptz default now()
);

create table if not exists point_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  amount integer not null,
  type text not null, -- 'quiz' | 'redeem' | 'bonus'
  description text,
  created_at timestamptz default now()
);

-- Seed default admin
insert into users (name, email, phone, school, role, referral_code)
values ('Admin BAINVES', 'admin@bainves.com', '08000000000', 'BAINVES HQ', 'admin', 'ADMIN001')
on conflict (email) do nothing;

-- Seed default prizes
insert into prizes (name, description, points_required, total_stock, image_url, category) values
('Honda Listrik EM1 e:', 'Motor listrik premium Honda', 50000, 10, 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?w=400', 'Kendaraan'),
('MacBook Air M2', 'Laptop Apple terbaru', 30000, 25, 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400', 'Elektronik'),
('iPhone 15 Pro', 'Smartphone flagship Apple', 25000, 30, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400', 'Elektronik'),
('Sepeda Polygon', 'Sepeda gunung premium', 10000, 50, 'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=400', 'Olahraga'),
('Saldo E-Wallet 100rb', 'Saldo GoPay/OVO/Dana', 1000, 5000, 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=400', 'Digital'),
('Voucher Belanja 500rb', 'Voucher Tokopedia/Shopee', 5000, 200, 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400', 'Digital')
on conflict do nothing;
`;

// ============================================================
// ICONS (inline SVG to avoid import issues)
// ============================================================
const Icon = ({ d, size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
const Icons = {
  Home: (p) => <Icon {...p} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" />,
  History: (p) => <Icon {...p} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  Award: (p) => <Icon {...p} d="M12 15a7 7 0 100-14 7 7 0 000 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />,
  Users: (p) => <Icon {...p} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" />,
  User: (p) => <Icon {...p} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z" />,
  Bell: (p) => <Icon {...p} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0" />,
  Search: (p) => <Icon {...p} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
  LogOut: (p) => <Icon {...p} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9" />,
  ChevronRight: (p) => <Icon {...p} d="M9 18l6-6-6-6" />,
  ChevronLeft: (p) => <Icon {...p} d="M15 18l-6-6 6-6" />,
  ArrowLeft: (p) => <Icon {...p} d="M19 12H5 M12 19l-7-7 7-7" />,
  Check: (p) => <Icon {...p} d="M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3" />,
  Wallet: (p) => <Icon {...p} d="M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a2 2 0 000 4h4v-4z" />,
  Gift: (p) => <Icon {...p} d="M20 12v10H4V12 M22 7H2v5h20V7z M12 22V7 M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />,
  Star: (p) => <Icon {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  Settings: (p) => <Icon {...p} d="M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />,
  X: (p) => <Icon {...p} d="M18 6L6 18 M6 6l12 12" />,
  Plus: (p) => <Icon {...p} d="M12 5v14 M5 12h14" />,
  Trash: (p) => <Icon {...p} d="M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6" />,
  Edit: (p) => <Icon {...p} d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />,
  Copy: (p) => <Icon {...p} d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.912 4.895 3 6 3h8c1.105 0 2 .912 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.088 19.105 22 18 22h-8c-1.105 0-2-.912-2-2.036V9.107c0-1.124.895-2.036 2-2.036z" />,
  TrendingUp: (p) => <Icon {...p} d="M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6" />,
  Download: (p) => <Icon {...p} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3" />,
  Shield: (p) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  BookOpen: (p) => <Icon {...p} d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />,
  Camera: (p) => <Icon {...p} d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z" />,
  Lock: (p) => <Icon {...p} d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4" />,
  Eye: (p) => <Icon {...p} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z" />,
  EyeOff: (p) => <Icon {...p} d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94 M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19 M1 1l22 22" />,
  Zap: (p) => <Icon {...p} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  RefreshCw: (p) => <Icon {...p} d="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0020.49 15" />,
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================
const fmt = (n) => new Intl.NumberFormat("id-ID").format(n);
const fmtRp = (n) => `Rp ${fmt(n)}`;
const dateStr = (d) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const timeStr = (d) => new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

// ============================================================
// MOCK AUTH (local storage based for demo)
// ============================================================
const AUTH_KEY = "bainves_user";
const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
};
const storeUser = (u) => localStorage.setItem(AUTH_KEY, JSON.stringify(u));
const clearUser = () => localStorage.removeItem(AUTH_KEY);

// ============================================================
// COMPONENTS
// ============================================================

// --- TOAST ---
const Toast = ({ toasts }) => (
  <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 pointer-events-none">
    {toasts.map((t) => (
      <div key={t.id} className={`px-4 py-3 rounded-2xl text-white text-sm font-bold shadow-xl animate-bounce-in ${t.type === "error" ? "bg-red-500" : t.type === "warn" ? "bg-orange-500" : "bg-emerald-500"}`}>
        {t.type === "error" ? "⚠️ " : t.type === "warn" ? "⚡ " : "✅ "}{t.msg}
      </div>
    ))}
  </div>
);

// --- MODAL ---
const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
    <div className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-6 border-b border-slate-100">
        <h2 className="font-black text-xl text-slate-900">{title}</h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
          <Icons.X size={16} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

// --- SETUP SCHEMA MODAL ---
const SchemaModal = ({ onClose }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="⚙️ Setup Database (Jalankan di Supabase)" onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-4">Buka <strong>Supabase → SQL Editor</strong>, paste SQL berikut, lalu klik Run.</p>
      <div className="relative">
        <pre className="bg-slate-950 text-emerald-400 text-xs p-4 rounded-2xl overflow-x-auto max-h-80 leading-relaxed">{SQL_SCHEMA}</pre>
        <button onClick={() => { navigator.clipboard.writeText(SQL_SCHEMA); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="absolute top-2 right-2 bg-slate-700 text-white px-3 py-1 rounded-xl text-xs font-bold hover:bg-slate-600 transition-colors">
          {copied ? "✅ Copied!" : "📋 Copy"}
        </button>
      </div>
      <button onClick={onClose} className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-2xl font-black">Sudah Selesai →</button>
    </Modal>
  );
};

// ============================================================
// LANDING PAGE
// ============================================================
const LandingPage = ({ onLogin, onShowSchema }) => {
  const prizes = [
    { name: "Honda Listrik EM1 e:", img: "https://images.unsplash.com/photo-1558981403-c5f91cbba527?w=400", pts: "50.000" },
    { name: "MacBook Air M2", img: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400", pts: "30.000" },
    { name: "iPhone 15 Pro", img: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400", pts: "25.000" },
    { name: "E-Wallet 100rb", img: "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=400", pts: "1.000" },
  ];
  return (
    <div className="min-h-screen bg-white font-sans overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .grad-text { background: linear-gradient(135deg,#4f46e5,#7c3aed); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .hero-bg { background: radial-gradient(ellipse 80% 60% at 50% -20%, #e0e7ff 0%, transparent 70%); }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .float { animation: float 4s ease-in-out infinite; }
        @keyframes bounce-in { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        .animate-bounce-in { animation: bounce-in 0.3s ease; }
      `}</style>
      <nav className="p-5 flex justify-between items-center max-w-6xl mx-auto">
        <h1 className="text-2xl font-black grad-text tracking-tighter">BAINVES</h1>
        <div className="flex items-center gap-3">
          <button onClick={onShowSchema} className="text-slate-500 text-sm font-bold px-4 py-2 hover:bg-slate-100 rounded-xl transition-colors">⚙️ Setup DB</button>
          <button onClick={onLogin} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors">Masuk</button>
        </div>
      </nav>

      <div className="hero-bg px-6 py-16 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-bold mb-8">
          <span className="animate-pulse">🔥</span> Platform Edukasi Berhadiah #1 Indonesia
        </div>
        <h2 className="text-5xl md:text-7xl font-black text-slate-900 leading-[1.05] mb-6">
          Jawab Soal,<br /><span className="grad-text">Menangkan Honda Listrik</span><br />& Hadiah Jutaan!
        </h2>
        <p className="text-slate-500 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
          Kerjakan soal sekolah, kumpulkan poin, ajak teman lewat sistem affiliate 10 level, dan tukarkan poin dengan hadiah impianmu.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
          <button onClick={onLogin} className="bg-indigo-600 text-white text-lg px-10 py-4 rounded-2xl font-black hover:scale-105 transition-all shadow-2xl shadow-indigo-200">🚀 Mulai Gratis Sekarang</button>
          <button onClick={onShowSchema} className="bg-white border-2 border-slate-200 text-slate-700 text-lg px-10 py-4 rounded-2xl font-black hover:bg-slate-50 transition-all">📋 Lihat SQL Schema</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
          {prizes.map((p, i) => (
            <div key={i} className="bg-white border border-slate-100 p-4 rounded-3xl shadow-sm hover:-translate-y-1 transition-transform group">
              <div className="overflow-hidden rounded-2xl h-32 mb-3 bg-slate-100">
                <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <p className="font-bold text-sm text-slate-800 mb-1">{p.name}</p>
              <p className="text-xs font-black text-indigo-600">{p.pts} Poin</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6 mb-20">
          {[["500rb+", "Pelajar Aktif"], ["1.200", "Soal/Hari"], ["10 Level", "Sistem Affiliate"]].map(([v, l]) => (
            <div key={l} className="text-center">
              <p className="text-4xl font-black grad-text">{v}</p>
              <p className="text-xs uppercase tracking-widest text-slate-400 mt-1">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-950 py-20 px-6 text-white text-center">
        <h3 className="text-3xl font-black mb-4">Affiliate 10 Level 🔗</h3>
        <p className="text-slate-400 mb-10 max-w-xl mx-auto">Setiap pembelian paket menghasilkan komisi 10% yang dibagi ke 10 level upline-mu secara otomatis.</p>
        <div className="flex justify-center gap-1 flex-wrap max-w-lg mx-auto mb-8">
          {[1,2,3,4,5,6,7,8,9,10].map(l => (
            <div key={l} className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl px-3 py-2 text-sm font-black">L{l}</div>
          ))}
        </div>
        <button onClick={onLogin} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-indigo-500 transition-colors">Bergabung Sekarang</button>
      </div>
    </div>
  );
};

// ============================================================
// AUTH PAGE
// ============================================================
const AuthPage = ({ onAuth, toast }) => {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", school: "", password: "", referral: "" });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.email || !form.password) return toast("Email & password wajib diisi", "error");
    setLoading(true);
    try {
      if (mode === "login") {
        // Fetch user by email
        const users = await supabase.from("users").select("*", `&email=eq.${encodeURIComponent(form.email)}&password_hash=eq.${encodeURIComponent(form.password)}`).catch(() => []);
        // Fallback: just fetch by email (no real auth yet)
        const all = await supabase.query("users", "GET", null, `?email=eq.${encodeURIComponent(form.email)}`);
        if (!all || all.length === 0) return toast("Email tidak ditemukan", "error");
        storeUser(all[0]);
        onAuth(all[0]);
      } else {
        if (!form.name) return toast("Nama wajib diisi", "error");
        // Check referral
        let referredBy = null;
        if (form.referral) {
          const refs = await supabase.query("users", "GET", null, `?referral_code=eq.${form.referral}`);
          if (!refs || refs.length === 0) return toast("Kode referral tidak valid", "warn");
          referredBy = refs[0].id;
        }
        const newUser = await supabase.query("users", "POST", {
          name: form.name, email: form.email, phone: form.phone,
          school: form.school, referred_by: referredBy, role: "user",
        });
        if (newUser && newUser[0]) { storeUser(newUser[0]); onAuth(newUser[0]); }
        else toast("Registrasi gagal. Coba lagi.", "error");
      }
    } catch (e) {
      toast(e.message || "Terjadi kesalahan", "error");
    } finally { setLoading(false); }
  };

  const inp = "w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none text-slate-900 text-sm font-medium transition-colors bg-white";

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap'); body{font-family:'Plus Jakarta Sans',sans-serif}`}</style>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-indigo-600 tracking-tighter mb-2">BAINVES</h1>
          <p className="text-slate-400 text-sm">Platform Edukasi Berhadiah</p>
        </div>
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            {["login", "register"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${mode === m ? "bg-white shadow-sm text-indigo-600" : "text-slate-400"}`}>
                {m === "login" ? "Masuk" : "Daftar"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === "register" && <>
              <input className={inp} placeholder="Nama Lengkap*" value={form.name} onChange={set("name")} />
              <input className={inp} placeholder="No. HP" value={form.phone} onChange={set("phone")} />
              <input className={inp} placeholder="Nama Sekolah" value={form.school} onChange={set("school")} />
            </>}
            <input className={inp} placeholder="Email*" type="email" value={form.email} onChange={set("email")} />
            <div className="relative">
              <input className={inp} placeholder="Password*" type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-3 text-slate-400">{showPw ? <Icons.EyeOff size={18} /> : <Icons.Eye size={18} />}</button>
            </div>
            {mode === "register" && <input className={inp} placeholder="Kode Referral (opsional)" value={form.referral} onChange={set("referral")} />}
          </div>

          <button onClick={handleSubmit} disabled={loading} className="mt-6 w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-200">
            {loading ? "⏳ Memproses..." : mode === "login" ? "Masuk ke BAINVES" : "Buat Akun Gratis"}
          </button>

          {mode === "login" && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700 font-medium">
              💡 <strong>Demo:</strong> Pastikan sudah jalankan SQL Schema. Login dengan email yang sudah terdaftar di Supabase.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN USER APP
// ============================================================
const UserApp = ({ user, onLogout, toast }) => {
  const [tab, setTab] = useState("home");
  const [darkMode, setDarkMode] = useState(false);
  const [userData, setUserData] = useState(user);
  const [prizes, setPrizes] = useState([]);
  const [pointHistory, setPointHistory] = useState([]);
  const [affiliateData, setAffiliateData] = useState({ commissions: [], total: 0 });
  const [quizStep, setQuizStep] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showRedeem, setShowRedeem] = useState(null);
  const [loading, setLoading] = useState(false);

  const TOTAL_SOAL = 1200;
  const BATCH = 100;

  const dm = (light, dark) => darkMode ? dark : light;

  useEffect(() => { loadPrizes(); loadHistory(); loadAffiliate(); }, []);

  const loadPrizes = async () => {
    try { const d = await supabase.query("prizes", "GET", null, "?active=eq.true&order=points_required.asc"); setPrizes(d || []); } catch {}
  };
  const loadHistory = async () => {
    try { const d = await supabase.query("point_history", "GET", null, `?user_id=eq.${userData.id}&order=created_at.desc&limit=20`); setPointHistory(d || []); } catch {}
  };
  const loadAffiliate = async () => {
    try {
      const d = await supabase.query("affiliate_commissions", "GET", null, `?user_id=eq.${userData.id}&order=created_at.desc`);
      const total = (d || []).reduce((s, c) => s + c.amount, 0);
      setAffiliateData({ commissions: d || [], total });
    } catch {}
  };
  const refreshUser = async () => {
    try { const d = await supabase.query("users", "GET", null, `?id=eq.${userData.id}`); if (d && d[0]) { setUserData(d[0]); storeUser(d[0]); } } catch {}
  };

  const startQuiz = async () => {
    if (!searchQuery.trim()) return toast("Pilih mata pelajaran dulu", "warn");
    try {
      const sess = await supabase.query("quiz_sessions", "POST", { user_id: userData.id, subject: searchQuery });
      if (sess && sess[0]) setSessionId(sess[0].id);
      setQuizStep("solving"); setCurrentQ(0);
    } catch { toast("Gagal memulai kuis", "error"); }
  };

  const answerQuestion = async (isLast) => {
    if (isLast) {
      try {
        await supabase.query("quiz_sessions", "PATCH", { total_answered: TOTAL_SOAL, points_earned: BATCH, completed: true }, `id=eq.${sessionId}`);
        await supabase.query("users", "PATCH", { points: (userData.points || 0) + BATCH, total_questions_answered: (userData.total_questions_answered || 0) + TOTAL_SOAL }, `id=eq.${userData.id}`);
        await supabase.query("point_history", "POST", { user_id: userData.id, amount: BATCH, type: "quiz", description: `Kuis: ${searchQuery} (${TOTAL_SOAL} soal)` });
        await refreshUser();
        setQuizStep("result");
      } catch { toast("Gagal menyimpan hasil", "error"); }
    } else {
      setCurrentQ((q) => q + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const redeemPrize = async (prize, address) => {
    if (userData.points < prize.points_required) return toast("Poin tidak cukup", "error");
    if (prize.total_stock - prize.claimed <= 0) return toast("Stok habis", "error");
    setLoading(true);
    try {
      await supabase.query("prize_redemptions", "POST", { user_id: userData.id, prize_id: prize.id, address });
      await supabase.query("prizes", "PATCH", { claimed: prize.claimed + 1 }, `id=eq.${prize.id}`);
      const newPts = userData.points - prize.points_required;
      await supabase.query("users", "PATCH", { points: newPts }, `id=eq.${userData.id}`);
      await supabase.query("point_history", "POST", { user_id: userData.id, amount: -prize.points_required, type: "redeem", description: `Penukaran: ${prize.name}` });
      await refreshUser(); loadPrizes(); loadHistory();
      setShowRedeem(null);
      toast(`✅ Penukaran ${prize.name} berhasil!`);
    } catch { toast("Penukaran gagal", "error"); }
    setLoading(false);
  };

  const requestWithdraw = async (amount, bank, accNum, accName) => {
    if (amount < 50000) return toast("Minimum penarikan Rp 50.000", "warn");
    if (amount > affiliateData.total) return toast("Saldo tidak cukup", "error");
    setLoading(true);
    try {
      await supabase.query("withdrawals", "POST", { user_id: userData.id, amount, bank_name: bank, account_number: accNum, account_name: accName });
      toast("Permintaan penarikan dikirim!");
      setShowWithdraw(false); loadAffiliate();
    } catch { toast("Penarikan gagal", "error"); }
    setLoading(false);
  };

  const referralLink = `${window.location.origin}?ref=${userData.referral_code}`;

  const bg = dm("bg-slate-50", "bg-slate-950");
  const card = dm("bg-white border-slate-100", "bg-slate-900 border-slate-800");
  const text = dm("text-slate-900", "text-white");
  const sub = dm("text-slate-500", "text-slate-400");

  const QUIZ_QUESTIONS = [
    { q: "Berapakah hasil dari akar kuadrat 144 × 2 ÷ 4?", opts: ["6", "12", "18", "24"] },
    { q: "Siapakah presiden pertama Republik Indonesia?", opts: ["Soekarno", "Soeharto", "Habibie", "Megawati"] },
    { q: "Apa ibukota Provinsi Jawa Barat?", opts: ["Bandung", "Jakarta", "Surabaya", "Semarang"] },
    { q: "Rumus kimia air adalah?", opts: ["H₂O", "CO₂", "NaCl", "O₂"] },
  ];
  const qData = QUIZ_QUESTIONS[currentQ % QUIZ_QUESTIONS.length];

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');`}</style>

      {/* HEADER */}
      {(tab === "home" || tab === "history") && (
        <header className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 border-b backdrop-blur-xl ${dm("bg-white/90 border-slate-200", "bg-slate-900/90 border-slate-800")} flex items-center justify-between`}>
          <h1 className="text-xl font-black text-indigo-600 tracking-tighter">BAINVES</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setDarkMode(!darkMode)} className={`w-8 h-8 rounded-full flex items-center justify-center ${dm("bg-slate-100 text-slate-600", "bg-slate-800 text-yellow-400")}`}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <div className="bg-indigo-100 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full border border-indigo-200">
              <span className="text-xs font-black text-indigo-600">⭐ {fmt(userData.points || 0)} Poin</span>
            </div>
          </div>
        </header>
      )}

      {/* MAIN */}
      <main className={`${tab === "home" || tab === "history" ? "pt-20 pb-28" : "pt-6 pb-8"} px-4 max-w-2xl mx-auto`}>

        {/* HOME */}
        {tab === "home" && (
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 p-6 rounded-3xl text-white shadow-xl shadow-indigo-200">
              <div className="flex items-center gap-3 mb-4">
                <img src={userData.photo} className="w-12 h-12 rounded-2xl object-cover border-2 border-white/30" />
                <div>
                  <h2 className="font-black text-lg">Halo, {userData.name}! 👋</h2>
                  <p className="text-indigo-200 text-xs">{userData.school || "BAINVES Member"}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["⭐", fmt(userData.points || 0), "Total Poin"],
                  ["📝", fmt(userData.total_questions_answered || 0), "Soal Dijawab"],
                  ["💰", fmtRp(affiliateData.total), "Komisi"],
                ].map(([ic, v, l]) => (
                  <div key={l} className="bg-white/10 rounded-2xl p-3 text-center">
                    <div className="text-xl mb-1">{ic}</div>
                    <div className="font-black text-sm truncate">{v}</div>
                    <div className="text-[10px] text-indigo-200 uppercase tracking-wide">{l}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setTab("quiz")} className="mt-4 w-full bg-white text-indigo-600 py-3 rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-sm">
                🚀 Kerjakan 1.200 Soal Sekarang!
              </button>
            </div>

            <div className="flex justify-between items-center">
              <h3 className="font-black text-lg">🎁 Katalog Hadiah</h3>
              <button onClick={() => setTab("prizes")} className="text-xs font-black text-indigo-600">Lihat Semua →</button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {prizes.slice(0, 4).map((p) => (
                <div key={p.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${card}`}>
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 flex-shrink-0">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate">{p.name}</p>
                    <p className="text-xs font-bold text-indigo-600 mt-0.5">⭐ {fmt(p.points_required)} Poin</p>
                    <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(5, ((p.total_stock - p.claimed) / p.total_stock) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Tersisa {p.total_stock - p.claimed}/{p.total_stock} unit</p>
                  </div>
                  <button onClick={() => setShowRedeem(p)} className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-colors flex-shrink-0">
                    Tukar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRIZES */}
        {tab === "prizes" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setTab("home")} className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center"><Icons.ArrowLeft size={18} className="text-slate-600" /></button>
              <h2 className="font-black text-2xl">🎁 Katalog Hadiah</h2>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-2xl border ${card} mb-2`}>
              <span className="text-2xl">⭐</span>
              <div>
                <p className="font-black text-indigo-600">{fmt(userData.points || 0)} Poin</p>
                <p className={`text-xs ${sub}`}>Poin tersedia untuk ditukar</p>
              </div>
            </div>
            {prizes.map((p) => (
              <div key={p.id} className={`p-4 rounded-3xl border ${card}`}>
                <div className="relative overflow-hidden rounded-2xl h-44 mb-4 bg-slate-100">
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-xs font-black px-2 py-1 rounded-lg backdrop-blur-sm">{p.category}</div>
                  {p.total_stock - p.claimed <= 5 && <div className="absolute bottom-2 left-2 bg-red-500 text-white text-xs font-black px-2 py-1 rounded-lg">⚠️ Hampir Habis!</div>}
                </div>
                <h4 className="font-black text-base mb-1">{p.name}</h4>
                <p className={`text-xs ${sub} mb-3`}>{p.description}</p>
                <div className="mb-3">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className={sub}>Tersisa</span>
                    <span className="text-indigo-600">{p.total_stock - p.claimed}/{p.total_stock} Unit</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(2, ((p.total_stock - p.claimed) / p.total_stock) * 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-black text-indigo-600 text-lg">⭐ {fmt(p.points_required)} Poin</span>
                  <button onClick={() => setShowRedeem(p)} disabled={userData.points < p.points_required || p.total_stock - p.claimed <= 0} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-sm disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                    {userData.points < p.points_required ? "Poin Kurang" : "Tukarkan"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* QUIZ */}
        {tab === "quiz" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => { setTab("home"); setQuizStep("search"); setCurrentQ(0); }} className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center"><Icons.ArrowLeft size={18} className="text-slate-600" /></button>
              <h2 className="font-black text-xl">📝 Kuis Soal</h2>
            </div>

            {quizStep === "search" && (
              <div className="text-center py-4">
                <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6"><Icons.BookOpen size={36} /></div>
                <h3 className="text-2xl font-black mb-2">Pilih Mata Pelajaran</h3>
                <p className={`text-sm ${sub} mb-8`}>1.200 soal tersedia dalam 12 batch masing-masing 100 soal</p>
                <div className="space-y-3 text-left">
                  <div className={`p-4 rounded-2xl border ${card}`}>
                    <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">Sekolah</p>
                    <p className="font-bold text-sm">{userData.school || "Belum diisi"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris", "Sejarah", "Geografi"].map((s) => (
                      <button key={s} onClick={() => setSearchQuery(s)} className={`p-3 rounded-2xl border-2 text-sm font-bold text-left transition-all ${searchQuery === s ? "border-indigo-500 bg-indigo-50 text-indigo-700" : dm("border-slate-100 bg-white text-slate-700", "border-slate-700 bg-slate-900 text-slate-300")}`}>{s}</button>
                    ))}
                  </div>
                  <input className={`w-full px-4 py-3 rounded-2xl border-2 focus:border-indigo-500 outline-none text-sm font-medium transition-colors ${dm("bg-white border-slate-200 text-slate-900", "bg-slate-900 border-slate-700 text-white")}`} placeholder="Atau ketik mata pelajaran lain..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <button onClick={startQuiz} disabled={!searchQuery.trim()} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-200 disabled:opacity-50">Mulai Kerjakan 100 Soal Pertama</button>
                </div>
              </div>
            )}

            {quizStep === "solving" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-black text-lg">{searchQuery}</h3>
                    <p className={`text-xs ${sub}`}>Soal {currentQ + 1} dari {TOTAL_SOAL}</p>
                  </div>
                  <div className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-xs font-black">Batch {Math.floor(currentQ / BATCH) + 1}</div>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full mb-6 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300" style={{ width: `${((currentQ + 1) / TOTAL_SOAL) * 100}%` }} />
                </div>
                <div className={`p-6 rounded-3xl border-2 ${dm("bg-white border-slate-100 shadow-xl", "bg-slate-900 border-slate-800")}`}>
                  <span className="text-indigo-600 font-black text-xs mb-3 block">SOAL NO. {currentQ + 1}</span>
                  <p className="text-base font-bold leading-relaxed mb-6">{qData.q}</p>
                  <div className="grid gap-2">
                    {qData.opts.map((ans, i) => (
                      <button key={i} onClick={() => answerQuestion(currentQ + 1 >= TOTAL_SOAL)} className={`p-4 rounded-2xl text-left font-bold border-2 transition-all hover:border-indigo-500 hover:bg-indigo-50 text-sm ${dm("border-slate-100 bg-slate-50 text-slate-700", "border-slate-800 bg-slate-950 text-slate-300")}`}>
                        <span className="text-slate-400 w-7 inline-block">{String.fromCharCode(65 + i)}.</span>{ans}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  {currentQ > 0 && <button onClick={() => setCurrentQ(q => q - 1)} className={`flex-1 py-4 rounded-2xl border-2 font-black text-sm flex items-center justify-center gap-2 ${dm("border-slate-200 text-slate-700", "border-slate-700 text-slate-300")}`}><Icons.ChevronLeft size={18} /> Kembali</button>}
                  <button onClick={() => answerQuestion(currentQ + 1 >= TOTAL_SOAL)} className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg flex items-center justify-center gap-2">
                    {currentQ + 1 >= TOTAL_SOAL ? "🏁 Selesai!" : "Jawab & Lanjut"} <Icons.ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {quizStep === "result" && (
              <div className="text-center py-10">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl">🏆</div>
                <h2 className="text-3xl font-black mb-2">Luar Biasa!</h2>
                <p className={`${sub} mb-8`}>Kamu menyelesaikan 1.200 soal {searchQuery}!</p>
                <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-8 rounded-3xl text-white mb-6">
                  <p className="text-sm opacity-80 uppercase tracking-widest font-bold mb-2">Poin Didapat</p>
                  <p className="text-5xl font-black">+{BATCH}</p>
                  <p className="text-indigo-200 text-sm mt-2">Total poin sekarang: {fmt((userData.points || 0))}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className={`p-4 rounded-2xl border ${card} text-center`}>
                    <p className="text-2xl font-black text-indigo-600">{fmt(TOTAL_SOAL)}</p>
                    <p className={`text-xs ${sub}`}>Soal Dijawab</p>
                  </div>
                  <div className={`p-4 rounded-2xl border ${card} text-center`}>
                    <p className="text-2xl font-black text-emerald-500">+{BATCH}</p>
                    <p className={`text-xs ${sub}`}>Poin Earned</p>
                  </div>
                </div>
                <button onClick={() => { setQuizStep("search"); setCurrentQ(0); setTab("home"); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black">Kembali ke Beranda</button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div className="space-y-4">
            <h2 className="font-black text-2xl mb-6">📊 Riwayat Poin</h2>
            {pointHistory.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📭</div>
                <p className={`${sub} font-medium`}>Belum ada riwayat poin</p>
                <button onClick={() => setTab("quiz")} className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm">Mulai Kuis</button>
              </div>
            ) : pointHistory.map((h) => (
              <div key={h.id} className={`flex items-center justify-between p-4 rounded-2xl border ${card}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl ${h.amount > 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                    {h.type === "quiz" ? "📝" : h.type === "redeem" ? "🎁" : "⭐"}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{h.description}</p>
                    <p className={`text-xs ${sub}`}>{dateStr(h.created_at)} • {timeStr(h.created_at)}</p>
                  </div>
                </div>
                <p className={`font-black ${h.amount > 0 ? "text-emerald-500" : "text-red-500"}`}>{h.amount > 0 ? "+" : ""}{fmt(h.amount)}</p>
              </div>
            ))}
          </div>
        )}

        {/* AFFILIATE */}
        {tab === "affiliate" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setTab("home")} className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center"><Icons.ArrowLeft size={18} className="text-slate-600" /></button>
              <h2 className="font-black text-xl">🔗 Affiliate</h2>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white">
              <p className="text-sm opacity-80 uppercase font-bold tracking-widest mb-1">Total Komisi</p>
              <p className="text-4xl font-black">{fmtRp(affiliateData.total)}</p>
              <button onClick={() => setShowWithdraw(true)} className="mt-4 bg-white text-emerald-700 px-5 py-2.5 rounded-xl font-black text-sm hover:scale-105 transition-all">💸 Tarik Saldo</button>
            </div>

            <div className={`p-5 rounded-3xl border ${card}`}>
              <p className="font-black text-sm mb-3">🔗 Link Referral Kamu</p>
              <div className={`flex items-center gap-2 p-3 rounded-2xl ${dm("bg-slate-50", "bg-slate-800")}`}>
                <p className="text-xs font-medium flex-1 truncate text-indigo-600">{referralLink}</p>
                <button onClick={() => { navigator.clipboard.writeText(referralLink); toast("Link disalin!"); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-black flex-shrink-0">Salin</button>
              </div>
              <p className={`text-xs ${sub} mt-2`}>Kode: <strong className="text-indigo-600">{userData.referral_code}</strong></p>
            </div>

            <div className={`p-5 rounded-3xl border ${card}`}>
              <p className="font-black text-sm mb-4">📊 Struktur Komisi 10 Level</p>
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => {
                  const pct = i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1.5 : i < 5 ? 1 : 0.5;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black flex-shrink-0">L{i+1}</div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct * 20}%` }} />
                      </div>
                      <span className="text-xs font-black text-indigo-600 w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <p className={`text-xs ${sub} mt-3`}>Total 10% dari setiap pembelian paket terdistribusi ke 10 level upline.</p>
            </div>

            {affiliateData.commissions.length > 0 && (
              <div className="space-y-3">
                <p className="font-black text-sm">💰 Riwayat Komisi</p>
                {affiliateData.commissions.map((c) => (
                  <div key={c.id} className={`flex items-center justify-between p-4 rounded-2xl border ${card}`}>
                    <div>
                      <p className="font-bold text-sm">Komisi Level {c.level}</p>
                      <p className={`text-xs ${sub}`}>{dateStr(c.created_at)}</p>
                    </div>
                    <p className="font-black text-emerald-500">+{fmtRp(c.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        {tab === "profile" && (
          <ProfileTab user={userData} onUpdate={(u) => { setUserData(u); storeUser(u); }} toast={toast} onLogout={onLogout} card={card} sub={sub} dm={dm} />
        )}
      </main>

      {/* BOTTOM NAV */}
      <nav className={`fixed bottom-0 left-0 right-0 z-50 border-t ${dm("bg-white/95 border-slate-200", "bg-slate-900/95 border-slate-800")} backdrop-blur-xl`}>
        <div className="flex justify-around items-center py-2 max-w-2xl mx-auto">
          {[
            { id: "home", icon: Icons.Home, label: "Beranda" },
            { id: "prizes", icon: Icons.Gift, label: "Hadiah" },
            { id: "quiz", icon: Icons.BookOpen, label: "Kuis" },
            { id: "affiliate", icon: Icons.Users, label: "Affiliate" },
            { id: "history", icon: Icons.History, label: "Riwayat" },
            { id: "profile", icon: Icons.User, label: "Profil" },
          ].map(({ id, icon: Ic, label }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-2xl transition-all ${tab === id ? "text-indigo-600" : dm("text-slate-400", "text-slate-500")}`}>
              <div className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${tab === id ? "bg-indigo-100" : ""}`}>
                <Ic size={18} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-wide">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* REDEEM MODAL */}
      {showRedeem && <RedeemModal prize={showRedeem} onClose={() => setShowRedeem(null)} onConfirm={redeemPrize} loading={loading} userPoints={userData.points} />}

      {/* WITHDRAW MODAL */}
      {showWithdraw && <WithdrawModal balance={affiliateData.total} onClose={() => setShowWithdraw(false)} onConfirm={requestWithdraw} loading={loading} />}
    </div>
  );
};

// ============================================================
// PROFILE TAB
// ============================================================
const ProfileTab = ({ user, onUpdate, toast, onLogout, card, sub, dm }) => {
  const [form, setForm] = useState({ name: user.name, phone: user.phone || "", school: user.school || "", photo: user.photo || "" });
  const [pwForm, setPwForm] = useState({ old: "", new: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inp = `w-full px-4 py-3 rounded-2xl border-2 focus:border-indigo-500 outline-none text-sm font-medium transition-colors ${dm("bg-white border-slate-200 text-slate-900", "bg-slate-900 border-slate-700 text-white")}`;

  const save = async () => {
    setSaving(true);
    try {
      await supabase.query("users", "PATCH", { name: form.name, phone: form.phone, school: form.school, photo: form.photo }, `id=eq.${user.id}`);
      onUpdate({ ...user, ...form });
      toast("Profil berhasil diperbarui!");
    } catch { toast("Gagal menyimpan", "error"); }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <h2 className="font-black text-2xl">👤 Profil Saya</h2>
      <div className="flex flex-col items-center py-4">
        <div className="relative">
          <img src={form.photo || user.photo} className="w-24 h-24 rounded-3xl object-cover border-4 border-indigo-200" />
          <div className="absolute -bottom-2 -right-2 bg-indigo-600 p-2 rounded-xl text-white"><Icons.Camera size={14} /></div>
        </div>
        <h3 className="mt-4 font-black text-xl">{user.name}</h3>
        <p className={`text-sm ${sub}`}>{user.email}</p>
        <div className="mt-2 bg-indigo-100 px-3 py-1 rounded-full text-xs font-black text-indigo-700">Kode: {user.referral_code}</div>
      </div>

      <div className={`p-5 rounded-3xl border ${card} space-y-3`}>
        <p className="font-black text-sm mb-1">✏️ Edit Profil</p>
        <input className={inp} placeholder="Nama Lengkap" value={form.name} onChange={set("name")} />
        <input className={inp} placeholder="No. HP" value={form.phone} onChange={set("phone")} />
        <input className={inp} placeholder="Nama Sekolah" value={form.school} onChange={set("school")} />
        <input className={inp} placeholder="URL Foto Profil" value={form.photo} onChange={set("photo")} />
        <button onClick={save} disabled={saving} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-black text-sm disabled:opacity-50">
          {saving ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>

      <div className={`p-5 rounded-3xl border ${card} space-y-3`}>
        <p className="font-black text-sm">📊 Statistik</p>
        {[
          ["⭐ Total Poin", fmt(user.points || 0)],
          ["📝 Soal Dijawab", fmt(user.total_questions_answered || 0)],
          ["📅 Bergabung", dateStr(user.created_at)],
        ].map(([l, v]) => (
          <div key={l} className="flex justify-between items-center">
            <span className={`text-sm ${sub}`}>{l}</span>
            <span className="font-black text-sm">{v}</span>
          </div>
        ))}
      </div>

      <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 border-2 border-red-200 text-red-500 py-4 rounded-2xl font-black text-sm hover:bg-red-50 transition-colors">
        <Icons.LogOut size={18} /> Keluar dari Akun
      </button>
    </div>
  );
};

// ============================================================
// REDEEM MODAL
// ============================================================
const RedeemModal = ({ prize, onClose, onConfirm, loading, userPoints }) => {
  const [address, setAddress] = useState("");
  const canRedeem = userPoints >= prize.points_required && prize.total_stock - prize.claimed > 0;
  return (
    <Modal title="🎁 Tukar Poin" onClose={onClose}>
      <div className="text-center mb-6">
        <img src={prize.image_url} alt={prize.name} className="w-full h-48 object-cover rounded-2xl mb-4" />
        <h3 className="font-black text-lg">{prize.name}</h3>
        <p className="text-indigo-600 font-black text-xl mt-1">⭐ {fmt(prize.points_required)} Poin</p>
        <p className="text-slate-500 text-sm mt-1">Poinmu: {fmt(userPoints)}</p>
        {!canRedeem && <p className="text-red-500 text-sm font-bold mt-2">⚠️ {userPoints < prize.points_required ? "Poin tidak cukup" : "Stok habis"}</p>}
      </div>
      {canRedeem && (
        <>
          <textarea className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-sm font-medium resize-none" placeholder="Alamat pengiriman lengkap..." rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
          <button onClick={() => onConfirm(prize, address)} disabled={!address.trim() || loading} className="mt-4 w-full bg-indigo-600 text-white py-4 rounded-2xl font-black disabled:opacity-50">
            {loading ? "Memproses..." : "Konfirmasi Penukaran"}
          </button>
        </>
      )}
    </Modal>
  );
};

// ============================================================
// WITHDRAW MODAL
// ============================================================
const WithdrawModal = ({ balance, onClose, onConfirm, loading }) => {
  const [f, setF] = useState({ amount: "", bank: "", accNum: "", accName: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const inp = "w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-sm font-medium";
  return (
    <Modal title="💸 Tarik Saldo Affiliate" onClose={onClose}>
      <p className="text-slate-500 text-sm mb-4">Saldo tersedia: <strong className="text-emerald-600">{fmtRp(balance)}</strong></p>
      <div className="space-y-3">
        <input className={inp} placeholder="Jumlah penarikan (min. 50.000)" type="number" value={f.amount} onChange={set("amount")} />
        <select className={inp} value={f.bank} onChange={set("bank")}>
          <option value="">-- Pilih Bank --</option>
          {["BCA", "BNI", "BRI", "Mandiri", "CIMB", "GoPay", "OVO", "Dana"].map(b => <option key={b}>{b}</option>)}
        </select>
        <input className={inp} placeholder="Nomor Rekening / No. HP" value={f.accNum} onChange={set("accNum")} />
        <input className={inp} placeholder="Nama Pemilik Rekening" value={f.accName} onChange={set("accName")} />
        <button onClick={() => onConfirm(Number(f.amount), f.bank, f.accNum, f.accName)} disabled={!f.amount || !f.bank || !f.accNum || !f.accName || loading} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black disabled:opacity-50">
          {loading ? "Memproses..." : "Ajukan Penarikan"}
        </button>
        <p className="text-xs text-slate-400 text-center">Proses 1-3 hari kerja setelah disetujui admin</p>
      </div>
    </Modal>
  );
};

// ============================================================
// ADMIN PANEL
// ============================================================
const AdminPanel = ({ admin, onLogout, toast }) => {
  const [tab, setTab] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [showPrizeForm, setShowPrizeForm] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadAll(); }, []);
  const loadAll = async () => {
    try {
      const [u, p, w, r] = await Promise.all([
        supabase.query("users", "GET", null, "?order=created_at.desc&limit=50"),
        supabase.query("prizes", "GET", null, "?order=created_at.desc"),
        supabase.query("withdrawals", "GET", null, "?order=created_at.desc"),
        supabase.query("prize_redemptions", "GET", null, "?order=created_at.desc"),
      ]);
      setUsers(u || []); setPrizes(p || []); setWithdrawals(w || []); setRedemptions(r || []);
    } catch {}
  };

  const approveWithdrawal = async (id) => {
    setLoading(true);
    try {
      await supabase.query("withdrawals", "PATCH", { status: "approved" }, `id=eq.${id}`);
      toast("Penarikan disetujui!"); loadAll();
    } catch { toast("Gagal", "error"); }
    setLoading(false);
  };
  const rejectWithdrawal = async (id) => {
    setLoading(true);
    try {
      await supabase.query("withdrawals", "PATCH", { status: "rejected" }, `id=eq.${id}`);
      toast("Penarikan ditolak", "warn"); loadAll();
    } catch { toast("Gagal", "error"); }
    setLoading(false);
  };
  const approveRedemption = async (id) => {
    try { await supabase.query("prize_redemptions", "PATCH", { status: "approved" }, `id=eq.${id}`); toast("Penukaran disetujui!"); loadAll(); } catch { toast("Gagal", "error"); }
  };
  const deletePrize = async (id) => {
    if (!confirm("Hapus hadiah ini?")) return;
    try { await supabase.query("prizes", "DELETE", null, `id=eq.${id}`); toast("Hadiah dihapus"); loadAll(); } catch { toast("Gagal", "error"); }
  };
  const savePrize = async (data) => {
    setLoading(true);
    try {
      if (data.id) { await supabase.query("prizes", "PATCH", data, `id=eq.${data.id}`); toast("Hadiah diperbarui!"); }
      else { await supabase.query("prizes", "POST", data); toast("Hadiah ditambahkan!"); }
      setShowPrizeForm(null); loadAll();
    } catch { toast("Gagal simpan", "error"); }
    setLoading(false);
  };

  const totalUsers = users.length;
  const totalPoints = users.reduce((s, u) => s + (u.points || 0), 0);
  const pendingW = withdrawals.filter(w => w.status === "pending").length;
  const pendingR = redemptions.filter(r => r.status === "pending").length;

  const AdminNav = () => (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
      {[["dashboard","📊 Dashboard"],["users","👥 Users"],["prizes","🎁 Hadiah"],["withdrawals","💸 Penarikan"],["redemptions","🔄 Penukaran"]].map(([id,label]) => (
        <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab===id ? "bg-indigo-600 text-white shadow-lg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
      ))}
    </div>
  );

  const badge = (status) => {
    const map = { pending: "bg-yellow-100 text-yellow-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-600", delivered: "bg-blue-100 text-blue-700" };
    return <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${map[status] || "bg-slate-100 text-slate-600"}`}>{status}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap'); * { font-family: 'Plus Jakarta Sans', sans-serif; } .no-scrollbar::-webkit-scrollbar{display:none}`}</style>
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-indigo-600">BAINVES Admin</h1>
          <p className="text-xs text-slate-400">{admin.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadAll} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><Icons.RefreshCw size={16} /></button>
          <button onClick={onLogout} className="flex items-center gap-2 text-red-500 bg-red-50 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"><Icons.LogOut size={16} /> Keluar</button>
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <AdminNav />

        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ["👥", totalUsers, "Total User", "bg-blue-50 text-blue-600"],
                ["⭐", fmt(totalPoints), "Total Poin", "bg-indigo-50 text-indigo-600"],
                ["💸", pendingW, "Tarik Pending", "bg-yellow-50 text-yellow-600"],
                ["🎁", pendingR, "Tukar Pending", "bg-purple-50 text-purple-600"],
              ].map(([ic, v, l, cls]) => (
                <div key={l} className={`p-5 rounded-3xl border border-slate-100 bg-white`}>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl ${cls} mb-3`}>{ic}</div>
                  <p className="text-2xl font-black text-slate-900">{v}</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">{l}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-3xl border border-slate-100 p-6">
              <h3 className="font-black text-lg mb-4">📋 Aktivitas Terbaru</h3>
              {withdrawals.slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="font-bold text-sm">Penarikan {fmtRp(w.amount)}</p>
                    <p className="text-xs text-slate-400">{dateStr(w.created_at)}</p>
                  </div>
                  {badge(w.status)}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-lg">👥 Daftar User ({users.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>{["Nama","Email","Sekolah","Poin","Soal","Role","Bergabung"].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold">{u.name}</td>
                      <td className="px-4 py-3 text-slate-500">{u.email}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-32 truncate">{u.school || "-"}</td>
                      <td className="px-4 py-3 font-black text-indigo-600">{fmt(u.points || 0)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmt(u.total_questions_answered || 0)}</td>
                      <td className="px-4 py-3">{u.role === "admin" ? <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg text-xs font-black">Admin</span> : <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs font-black">User</span>}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{dateStr(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "prizes" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-lg">🎁 Kelola Hadiah</h3>
              <button onClick={() => setShowPrizeForm({})} className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-indigo-700 transition-colors">
                <Icons.Plus size={16} /> Tambah Hadiah
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {prizes.map(p => (
                <div key={p.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden">
                  <div className="h-36 overflow-hidden bg-slate-100">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-sm">{p.name}</h4>
                        <p className="text-indigo-600 font-black text-sm">⭐ {fmt(p.points_required)} Poin</p>
                      </div>
                      <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${p.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.active ? "Aktif" : "Nonaktif"}</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-400">Tersisa</span>
                        <span className="text-slate-600">{p.total_stock - p.claimed}/{p.total_stock}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(2, ((p.total_stock - p.claimed) / p.total_stock) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => setShowPrizeForm(p)} className="flex-1 border border-indigo-200 text-indigo-600 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 hover:bg-indigo-50 transition-colors"><Icons.Edit size={12} /> Edit</button>
                      <button onClick={() => deletePrize(p.id)} className="flex-1 border border-red-200 text-red-500 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 hover:bg-red-50 transition-colors"><Icons.Trash size={12} /> Hapus</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "withdrawals" && (
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-black text-lg">💸 Permintaan Penarikan</h3>
            </div>
            {withdrawals.length === 0 ? <div className="p-12 text-center text-slate-400">Belum ada permintaan penarikan</div> : (
              <div className="divide-y divide-slate-50">
                {withdrawals.map(w => (
                  <div key={w.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{fmtRp(w.amount)}</p>
                      <p className="text-xs text-slate-500">{w.bank_name} • {w.account_number} • {w.account_name}</p>
                      <p className="text-xs text-slate-400">{dateStr(w.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {badge(w.status)}
                      {w.status === "pending" && <>
                        <button onClick={() => approveWithdrawal(w.id)} disabled={loading} className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-emerald-600 transition-colors disabled:opacity-50">✅ Setuju</button>
                        <button onClick={() => rejectWithdrawal(w.id)} disabled={loading} className="bg-red-500 text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-red-600 transition-colors disabled:opacity-50">❌ Tolak</button>
                      </>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "redemptions" && (
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-black text-lg">🔄 Penukaran Hadiah</h3>
            </div>
            {redemptions.length === 0 ? <div className="p-12 text-center text-slate-400">Belum ada penukaran</div> : (
              <div className="divide-y divide-slate-50">
                {redemptions.map(r => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">Penukaran Hadiah</p>
                      <p className="text-xs text-slate-500 truncate">{r.address || "Alamat tidak diisi"}</p>
                      <p className="text-xs text-slate-400">{dateStr(r.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {badge(r.status)}
                      {r.status === "pending" && (
                        <button onClick={() => approveRedemption(r.id)} className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-black hover:bg-emerald-600 transition-colors">✅ Setuju</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showPrizeForm !== null && <PrizeFormModal prize={showPrizeForm} onClose={() => setShowPrizeForm(null)} onSave={savePrize} loading={loading} />}
    </div>
  );
};

// ============================================================
// PRIZE FORM MODAL
// ============================================================
const PrizeFormModal = ({ prize, onClose, onSave, loading }) => {
  const [f, setF] = useState({ name: prize.name || "", description: prize.description || "", points_required: prize.points_required || "", total_stock: prize.total_stock || "", image_url: prize.image_url || "", category: prize.category || "", active: prize.active !== false });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const inp = "w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-sm font-medium";
  const handleSave = () => onSave({ ...f, points_required: Number(f.points_required), total_stock: Number(f.total_stock), ...(prize.id ? { id: prize.id } : {}) });
  return (
    <Modal title={prize.id ? "✏️ Edit Hadiah" : "➕ Tambah Hadiah"} onClose={onClose}>
      <div className="space-y-3">
        <input className={inp} placeholder="Nama Hadiah*" value={f.name} onChange={set("name")} />
        <textarea className={`${inp} resize-none`} placeholder="Deskripsi" value={f.description} onChange={set("description")} rows={2} />
        <input className={inp} placeholder="Poin yang Dibutuhkan*" type="number" value={f.points_required} onChange={set("points_required")} />
        <input className={inp} placeholder="Jumlah Stok*" type="number" value={f.total_stock} onChange={set("total_stock")} />
        <input className={inp} placeholder="URL Gambar" value={f.image_url} onChange={set("image_url")} />
        <select className={inp} value={f.category} onChange={set("category")}>
          <option value="">-- Kategori --</option>
          {["Kendaraan","Elektronik","Digital","Fashion","Olahraga","Lainnya"].map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={f.active} onChange={set("active")} className="w-5 h-5 accent-indigo-600" />
          <span className="font-bold text-sm">Hadiah Aktif</span>
        </label>
        {f.image_url && <img src={f.image_url} alt="" className="w-full h-32 object-cover rounded-2xl" />}
        <button onClick={handleSave} disabled={!f.name || !f.points_required || !f.total_stock || loading} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black disabled:opacity-50">
          {loading ? "Menyimpan..." : prize.id ? "Simpan Perubahan" : "Tambah Hadiah"}
        </button>
      </div>
    </Modal>
  );
};

// ============================================================
// ROOT APP
// ============================================================
export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | auth | app | admin
  const [user, setUser] = useState(null);
  const [showSchema, setShowSchema] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) { setUser(stored); setScreen(stored.role === "admin" ? "admin" : "app"); }
  }, []);

  const toast = (msg, type = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const handleAuth = (u) => {
    setUser(u);
    setScreen(u.role === "admin" ? "admin" : "app");
    toast(`Selamat datang, ${u.name}! 👋`);
  };

  const handleLogout = () => {
    clearUser(); setUser(null); setScreen("landing"); toast("Sampai jumpa!", "warn");
  };

  return (
    <>
      <Toast toasts={toasts} />
      {showSchema && <SchemaModal onClose={() => setShowSchema(false)} />}
      {screen === "landing" && <LandingPage onLogin={() => setScreen("auth")} onShowSchema={() => setShowSchema(true)} />}
      {screen === "auth" && <AuthPage onAuth={handleAuth} toast={toast} />}
      {screen === "app" && user && <UserApp user={user} onLogout={handleLogout} toast={toast} />}
      {screen === "admin" && user && <AdminPanel admin={user} onLogout={handleLogout} toast={toast} />}
    </>
  );
}
