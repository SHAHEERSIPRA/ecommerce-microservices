'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api';

/* ─── colour maps ─── */
const SVC = { 'user-service': '#a371f7', 'product-service': '#3fb950', 'order-service': '#58a6ff', external: '#8b949e' };
const STAT = { pending: '#d29922', confirmed: '#238636', shipped: '#58a6ff', delivered: '#3fb950', cancelled: '#da3633' };
const MTH = { GET: '#1f6feb', POST: '#238636', DELETE: '#da3633', PATCH: '#d29922', PUT: '#d29922' };

/* ─── tiny helpers ─── */
const s = {
  card: 'bg-[#161b22] border border-[#30363d] rounded-xl p-5 mb-4',
  title: 'text-[#58a6ff] text-lg font-semibold mb-4',
  input: 'px-3 py-2 border border-[#30363d] rounded-lg bg-[#0d1117] text-[#c9d1d9] text-sm w-full',
  btn: 'px-5 py-2.5 border-none rounded-lg cursor-pointer text-sm font-semibold text-white transition-opacity',
  btnSm: 'px-3 py-1.5 border-none rounded-md cursor-pointer text-xs font-semibold text-white',
  th: 'text-left p-2.5 border-b-2 border-[#30363d] text-[#58a6ff] font-semibold text-xs',
  td: 'p-2 border-b border-[#21262d] text-sm',
  badge: 'inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white',
};

function Badge({ color, children }) {
  return <span className={s.badge} style={{ background: color }}>{children}</span>;
}

/* ════════════════════ ENV INFO ════════════════════ */
function EnvInfo() {
  return (
    <div className={s.card}>
      <h3 className={s.title}>Environment Variables (from .env)</h3>
      <table className="w-full text-xs">
        <tbody>
          {Object.entries(api.SERVICES).map(([name, url]) => (
            <tr key={name}>
              <td className="p-2 font-mono text-[#a371f7]">NEXT_PUBLIC_{name.replace(/-/g, '_').toUpperCase()}_URL</td>
              <td className="p-2 font-mono text-[#3fb950]">{url}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════ HEALTH ════════════════════ */
function HealthPanel() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const check = async () => { setLoading(true); try { setHealth(await api.getServicesHealth()); } catch (e) { setHealth({ error: e.message }); } setLoading(false); };
  useEffect(() => { check(); }, []);

  return (
    <div className={s.card}>
      <div className="flex justify-between items-center">
        <h3 className={s.title}>Service Health</h3>
        <button className={`${s.btn} bg-[#1f6feb]`} onClick={check} disabled={loading}>{loading ? 'Checking...' : 'Refresh'}</button>
      </div>
      {health && !health.error ? (
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(health).map(([name, info]) => (
            <div key={name} className={`${s.card} !mb-0 flex items-center gap-2`}>
              <span className="w-3 h-3 rounded-full" style={{ background: info.status === 'healthy' ? '#238636' : '#da3633' }} />
              <div>
                <strong style={{ color: SVC[name] }}>{name}</strong>
                <div className="text-xs text-[#8b949e]">
                  {info.status === 'healthy' ? `DB: ${info.data?.dbState || 'n/a'} | Up: ${Math.floor(info.data?.uptime || 0)}s` : info.error}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : health?.error ? <p className="text-[#da3633]">Error: {health.error}</p> : <p className="text-[#8b949e]">Loading...</p>}
    </div>
  );
}

/* ════════════════════ ARCHITECTURE ════════════════════ */
function ServiceNode({ icon, name, port, color, subtitle, delay = 0, pulse }) {
  return (
    <div className="relative group arch-pop" style={{ animationDelay: `${delay}ms` }}>
      {/* Animated glow */}
      <div className="absolute -inset-1 rounded-2xl arch-pulse-glow" style={{ background: color, animationDelay: `${delay + 200}ms` }} />
      {/* Card */}
      <div className="relative bg-[#0d1117] border-2 rounded-2xl p-4 text-center min-w-[140px] transition-all duration-500 hover:scale-110 hover:-translate-y-1 cursor-default"
        style={{ borderColor: color + '44', boxShadow: `0 0 20px ${color}15, inset 0 1px 0 ${color}15` }}>
        {/* Pulse dot */}
        {pulse && <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: color }} />
        </span>}
        <div className="text-3xl mb-1.5 transition-transform duration-300 group-hover:scale-125">{icon}</div>
        <div className="text-sm font-bold tracking-wide" style={{ color }}>{name}</div>
        {subtitle && <div className="text-[10px] text-[#6e7681] mt-0.5">{subtitle}</div>}
        <div className="mt-2 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border"
          style={{ background: color + '15', color, borderColor: color + '33' }}>{port}</div>
      </div>
    </div>
  );
}

function AnimatedArrow({ color = '#30363d', label, delay = 0, horizontal }) {
  if (horizontal) {
    return (
      <div className="flex items-center gap-1 arch-fade-up" style={{ animationDelay: `${delay}ms` }}>
        <span className="text-[8px] text-[#6e7681] whitespace-nowrap">{label}</span>
        <div className="relative h-[2px] flex-1 min-w-[30px] overflow-hidden rounded-full">
          <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(90deg, ${color}22, ${color}, ${color}22)` }} />
          {/* Animated particle */}
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-[3px] rounded-full animate-[slideParticle_1.5s_ease-in-out_infinite]" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        </div>
        <svg width="8" height="10" viewBox="0 0 8 10"><polygon points="0,0 8,5 0,10" fill={color} /></svg>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center px-1 arch-fade-up" style={{ animationDelay: `${delay}ms` }}>
      {label && <div className="text-[9px] text-[#6e7681] mb-1 whitespace-nowrap font-mono">{label}</div>}
      <svg width="2" height="36" className="overflow-visible">
        <line x1="1" y1="0" x2="1" y2="30" stroke={color} strokeWidth="2" strokeDasharray="4,4" style={{ animation: 'dashFlow 0.8s linear infinite' }} />
        <polygon points="-3,30 5,30 1,36" fill={color} />
      </svg>
    </div>
  );
}

function MeshLine({ from, to, fromColor, toColor, label, delay = 0 }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-[#21262d55] transition-colors duration-200 arch-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fromColor, boxShadow: `0 0 6px ${fromColor}` }} />
      <span className="text-[11px] font-semibold" style={{ color: fromColor }}>{from}</span>
      <svg width="24" height="8" className="flex-shrink-0">
        <line x1="0" y1="4" x2="18" y2="4" stroke="#6e7681" strokeWidth="1.5" strokeDasharray="3,2" style={{ animation: 'dashFlow 1s linear infinite' }} />
        <polygon points="16,1 22,4 16,7" fill="#6e7681" />
      </svg>
      <span className="text-[11px] font-semibold" style={{ color: toColor }}>{to}</span>
      <span className="text-[9px] text-[#484f58] ml-auto font-mono bg-[#0d1117] px-1.5 py-0.5 rounded border border-[#21262d]">{label}</span>
    </div>
  );
}

function ArchitectureDiagram() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  if (!visible) return null;

  return (
    <div className={s.card + ' overflow-hidden'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className={s.title + ' !mb-0'}>System Architecture</h3>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#238636]/10 border border-[#238636]/20">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-[#238636] opacity-75" /><span className="relative rounded-full h-2 w-2 bg-[#238636]" /></span>
          <span className="text-[10px] text-[#3fb950] font-semibold">LIVE</span>
        </div>
      </div>
      <p className="text-xs text-[#6e7681] mb-5">Frontend calls each microservice directly via REST. Each service has its own database. Services communicate for cross-domain operations.</p>

      <div className="bg-[#010409] border border-[#21262d] rounded-2xl p-6 md:p-8 overflow-x-auto"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d111755, #010409)' }}>

        {/* ── Cluster boundary ── */}
        <div className="relative border border-[#1f6feb22] rounded-3xl p-6 md:p-8"
          style={{ background: 'linear-gradient(180deg, #1f6feb06, transparent 40%)' }}>

          {/* Cluster label */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#010409] border border-[#1f6feb33] rounded-full arch-fade-down">
            <span className="text-[11px] font-bold text-[#1f6feb] tracking-widest uppercase">☁️ AWS ECS Cluster · Fargate</span>
          </div>

          {/* Row 1: Internet */}
          <div className="flex flex-col items-center mt-3 mb-4 arch-fade-down" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2.5 px-5 py-2 rounded-full border border-[#484f5833]"
              style={{ background: 'linear-gradient(135deg, #21262d, #161b22)' }}>
              <span className="text-lg">🌐</span>
              <span className="text-xs font-bold text-[#c9d1d9] tracking-wide">Internet / Browser</span>
            </div>
          </div>

          <AnimatedArrow label="HTTP :3000" color="#f0883e" delay={200} />

          {/* Row 2: Frontend */}
          <div className="flex justify-center my-3">
            <ServiceNode icon="⚡" name="Frontend" port=":3000" color="#f0883e" subtitle="Next.js · Standalone" delay={300} pulse />
          </div>

          {/* Row 3: REST arrows to services */}
          <div className="flex justify-center items-start my-2">
            <div className="grid grid-cols-3 gap-8 md:gap-14 max-w-xl w-full">
              <AnimatedArrow label="REST" color="#a371f7" delay={500} />
              <AnimatedArrow label="REST" color="#3fb950" delay={600} />
              <AnimatedArrow label="REST" color="#58a6ff" delay={700} />
            </div>
          </div>

          {/* Row 4: Microservices */}
          <div className="flex justify-center my-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 max-w-2xl w-full">
              <ServiceNode icon="👤" name="User Service" port=":4001" color="#a371f7" subtitle="Express · Mongoose" delay={800} pulse />
              <ServiceNode icon="📦" name="Product Service" port=":4002" color="#3fb950" subtitle="Express · Mongoose" delay={900} pulse />
              <ServiceNode icon="🛒" name="Order Service" port=":4003" color="#58a6ff" subtitle="Express · Mongoose" delay={1000} pulse />
            </div>
          </div>

          {/* Inter-service mesh */}
          <div className="flex justify-center my-5">
            <div className="bg-[#0d1117] border border-[#30363d44] rounded-2xl px-4 py-3 max-w-lg w-full arch-fade-up"
              style={{ animationDelay: '1100ms', boxShadow: '0 0 30px #d2992208' }}>
              <div className="flex items-center justify-center gap-2 mb-2.5">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#d29922] to-transparent opacity-30" />
                <span className="text-[9px] text-[#d29922] font-bold uppercase tracking-[0.2em]">Inter-Service Mesh</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#d29922] to-transparent opacity-30" />
              </div>
              <MeshLine from="user-svc" to="order-svc" fromColor="#a371f7" toColor="#58a6ff" label="GET /orders?userId=" delay={1200} />
              <MeshLine from="product-svc" to="order-svc" fromColor="#3fb950" toColor="#58a6ff" label="GET /orders?productId=" delay={1300} />
              <MeshLine from="order-svc" to="user + product" fromColor="#58a6ff" toColor="#d29922" label="validate & enrich" delay={1400} />
            </div>
          </div>

          {/* Arrow to DB */}
          <AnimatedArrow label="mongodb://27017" color="#238636" delay={1500} />

          {/* MongoDB */}
          <div className="flex justify-center mt-3">
            <ServiceNode icon="🍃" name="MongoDB" port=":27017" color="#238636" subtitle="userdb · productdb · orderdb" delay={1600} />
          </div>
        </div>

        {/* Legend */}
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 arch-fade-up" style={{ animationDelay: '1700ms' }}>
          {[
            { color: '#f0883e', label: 'Frontend', icon: '⚡' },
            { color: '#a371f7', label: 'User Service', icon: '👤' },
            { color: '#3fb950', label: 'Product Service', icon: '📦' },
            { color: '#58a6ff', label: 'Order Service', icon: '🛒' },
            { color: '#238636', label: 'MongoDB', icon: '🍃' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 group/leg cursor-default">
              <span className="w-2 h-2 rounded-full transition-transform duration-300 group-hover/leg:scale-150" style={{ background: l.color, boxShadow: `0 0 6px ${l.color}55` }} />
              <span className="text-[10px] text-[#6e7681] group-hover/leg:text-[#c9d1d9] transition-colors">{l.icon} {l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deployment CTA */}
      <div className="mt-4 flex items-start gap-3 p-4 rounded-xl border arch-fade-up"
        style={{ animationDelay: '1800ms', background: 'linear-gradient(135deg, #1f6feb08, #23863608)', borderColor: '#1f6feb22' }}>
        <span className="text-lg">🚀</span>
        <div>
          <p className="text-[12px] text-[#c9d1d9] font-semibold mb-1">Ready to Deploy?</p>
          <p className="text-[11px] text-[#6e7681] leading-relaxed">
            Use <strong className="text-[#58a6ff]">AWS ALB</strong> with path-based routing + <strong className="text-[#3fb950]">Cloud Map</strong> for service discovery.
            See <strong className="text-[#f0883e]">ECS_DEPLOY.md</strong> and <strong className="text-[#a371f7]">CICD_GUIDE.md</strong> for step-by-step guides.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════ TRAFFIC ════════════════════ */
function TrafficPanel() {
  const [traffic, setTraffic] = useState([]);
  const [auto, setAuto] = useState(true);
  const [filter, setFilter] = useState('all');
  const load = useCallback(async () => { try { setTraffic(await api.getTraffic()); } catch {} }, []);
  useEffect(() => { load(); if (!auto) return; const iv = setInterval(load, 2000); return () => clearInterval(iv); }, [auto, load]);
  const clear = async () => { await api.clearTraffic(); setTraffic([]); };
  const filtered = filter === 'all' ? traffic : filter === 'inter-service' ? traffic.filter(t => t.source !== 'external') : traffic.filter(t => t.service === filter);

  return (
    <div className={s.card}>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
        <h3 className={s.title + ' !mb-0'}>Live Traffic / Request Flow</h3>
        <div className="flex gap-2 flex-wrap">
          <select className={`${s.input} !w-auto`} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All Traffic</option>
            <option value="inter-service">Inter-Service Only</option>
            <option value="user-service">User Service</option>
            <option value="product-service">Product Service</option>
            <option value="order-service">Order Service</option>
          </select>
          <button className={`${s.btnSm}`} style={{ background: auto ? '#238636' : '#6e7681' }} onClick={() => setAuto(!auto)}>{auto ? '● Auto ON' : '○ Auto OFF'}</button>
          <button className={`${s.btnSm} bg-[#da3633]`} onClick={clear}>Clear</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-[#8b949e] text-center py-5">No traffic yet. Use other tabs to create data and watch traffic flow!</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr>
              {['Time', 'Dir', 'Method', 'Path', 'Source → Target', 'Status', 'ms', 'Trace'].map(h => <th key={h} className={s.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.slice(0, 100).map((t, i) => (
                <tr key={t.id || i} style={{ background: t.direction === 'outgoing' ? 'rgba(240,136,62,0.05)' : 'transparent' }}>
                  <td className={s.td}>{new Date(t.timestamp).toLocaleTimeString()}</td>
                  <td className={s.td}><Badge color={t.direction === 'incoming' ? '#1f6feb' : '#f0883e'}>{t.direction === 'incoming' ? 'IN' : 'OUT'}</Badge></td>
                  <td className={s.td}><Badge color={MTH[t.method] || '#6e7681'}>{t.method}</Badge></td>
                  <td className={`${s.td} font-mono`}>{t.path}</td>
                  <td className={s.td}><span style={{ color: SVC[t.source] || '#8b949e' }}>{t.source}</span>{' → '}<span style={{ color: SVC[t.target] || '#c9d1d9' }}>{t.target}</span></td>
                  <td className={s.td}><Badge color={t.statusCode < 300 ? '#238636' : t.statusCode < 500 ? '#d29922' : '#da3633'}>{t.statusCode || '...'}</Badge></td>
                  <td className={`${s.td} font-mono`}>{t.duration ? `${t.duration}` : '-'}</td>
                  <td className={`${s.td} font-mono text-[#8b949e] text-[11px]`}>{t.traceId?.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════ USERS ════════════════════ */
function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'customer' });
  const [resp, setResp] = useState(null);
  const load = async () => { try { setUsers((await api.getUsers()).data); } catch {} };
  useEffect(() => { load(); }, []);

  const create = async e => { e.preventDefault(); try { setResp((await api.createUser(form)).data); setForm({ name: '', email: '', role: 'customer' }); load(); } catch (err) { setResp(err.response?.data || { error: err.message }); } };
  const remove = async id => { try { setResp((await api.deleteUser(id)).data); load(); } catch (err) { setResp(err.response?.data || { error: err.message }); } };
  const profile = async id => { try { setResp((await api.getUserProfile(id)).data); } catch (err) { setResp(err.response?.data || { error: err.message }); } };

  return (
    <div className={s.card}>
      <h3 className={s.title}>👤 Users — calls user-service directly</h3>
      <p className="text-[#d29922] text-xs mb-3">⚡ "Profile" → user-service → order-service. "Delete" checks active orders first.</p>
      <form onSubmit={create} className="flex gap-2 mb-4 flex-wrap">
        <input className={`${s.input} flex-1`} placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input className={`${s.input} flex-1`} placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
        <select className={`${s.input} !w-32`} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          <option value="customer">Customer</option><option value="admin">Admin</option>
        </select>
        <button type="submit" className={`${s.btn} bg-[#238636]`}>Create</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead><tr>{['Name', 'Email', 'Role', 'ID', 'Actions'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
          <tbody>{users.map(u => (
            <tr key={u._id}>
              <td className={s.td}>{u.name}</td><td className={s.td}>{u.email}</td>
              <td className={s.td}><Badge color={u.role === 'admin' ? '#a371f7' : '#1f6feb'}>{u.role}</Badge></td>
              <td className={`${s.td} font-mono text-[11px]`}>{u._id}</td>
              <td className={s.td}>
                <div className="flex gap-1">
                  <button className={`${s.btnSm} bg-[#1f6feb]`} onClick={() => profile(u._id)}>Profile</button>
                  <button className={`${s.btnSm} bg-[#da3633]`} onClick={() => remove(u._id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {resp && <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 mt-3 max-h-96 overflow-y-auto">
        <strong className="text-[#58a6ff] text-xs">Response:</strong>
        <pre className="mt-2 text-[#3fb950] text-xs">{JSON.stringify(resp, null, 2)}</pre>
      </div>}
    </div>
  );
}

/* ════════════════════ PRODUCTS ════════════════════ */
function ProductsPanel() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', price: '', stock: '', category: 'general' });
  const [resp, setResp] = useState(null);
  const load = async () => { try { setProducts((await api.getProducts()).data); } catch {} };
  useEffect(() => { load(); }, []);

  const create = async e => { e.preventDefault(); try { setResp((await api.createProduct({ ...form, price: Number(form.price), stock: Number(form.stock) })).data); setForm({ name: '', description: '', price: '', stock: '', category: 'general' }); load(); } catch (err) { setResp(err.response?.data || { error: err.message }); } };
  const remove = async id => { try { setResp((await api.deleteProduct(id)).data); load(); } catch (err) { setResp(err.response?.data || { error: err.message }); } };
  const stats = async id => { try { setResp((await api.getProductStats(id)).data); } catch (err) { setResp(err.response?.data || { error: err.message }); } };

  return (
    <div className={s.card}>
      <h3 className={s.title}>📦 Products — calls product-service directly</h3>
      <p className="text-[#d29922] text-xs mb-3">⚡ "Stats" → product-service → order-service. "Delete" checks active orders first.</p>
      <form onSubmit={create} className="flex gap-2 mb-4 flex-wrap">
        <input className={`${s.input} flex-1`} placeholder="Product Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input className={`${s.input} flex-1`} placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <input className={`${s.input} !w-24`} placeholder="Price" type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
        <input className={`${s.input} !w-24`} placeholder="Stock" type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} required />
        <button type="submit" className={`${s.btn} bg-[#238636]`}>Create</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead><tr>{['Name', 'Price', 'Stock', 'Category', 'ID', 'Actions'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
          <tbody>{products.map(p => (
            <tr key={p._id}>
              <td className={s.td}>{p.name}</td>
              <td className={s.td}>${p.price?.toFixed(2)}</td>
              <td className={s.td}><Badge color={p.stock > 0 ? '#238636' : '#da3633'}>{p.stock}</Badge></td>
              <td className={s.td}>{p.category}</td>
              <td className={`${s.td} font-mono text-[11px]`}>{p._id}</td>
              <td className={s.td}>
                <div className="flex gap-1">
                  <button className={`${s.btnSm} bg-[#1f6feb]`} onClick={() => stats(p._id)}>Stats</button>
                  <button className={`${s.btnSm} bg-[#da3633]`} onClick={() => remove(p._id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {resp && <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 mt-3 max-h-96 overflow-y-auto">
        <strong className="text-[#58a6ff] text-xs">Response:</strong>
        <pre className="mt-2 text-[#3fb950] text-xs">{JSON.stringify(resp, null, 2)}</pre>
      </div>}
    </div>
  );
}

/* ════════════════════ ORDERS ════════════════════ */
function OrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ userId: '', productId: '', quantity: '1' });
  const [resp, setResp] = useState(null);

  const load = async () => { try { const [o, u, p] = await Promise.all([api.getOrders(), api.getUsers(), api.getProducts()]); setOrders(o.data); setUsers(u.data); setProducts(p.data); } catch {} };
  useEffect(() => { load(); }, []);

  const create = async e => { e.preventDefault(); try { setResp((await api.createOrder({ userId: form.userId, items: [{ productId: form.productId, quantity: Number(form.quantity) }] })).data); load(); } catch (err) { setResp(err.response?.data || { error: err.message }); } };
  const view = async id => { try { setResp((await api.getOrder(id)).data); } catch (err) { setResp(err.response?.data || { error: err.message }); } };
  const update = async (id, status) => { try { setResp((await api.updateOrderStatus(id, status)).data); load(); } catch (err) { setResp(err.response?.data || { error: err.message }); } };

  return (
    <div className={s.card}>
      <h3 className={s.title}>🛒 Orders — calls order-service directly</h3>
      <p className="text-[#d29922] text-xs mb-3">⚡ Create → order-service → user-service (validate) → product-service (stock check + reduce). "View" enriches with live user+product data.</p>
      <form onSubmit={create} className="flex gap-2 mb-4 flex-wrap items-end">
        <div className="flex-1">
          <label className="text-xs text-[#8b949e]">User</label>
          <select className={s.input} value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} required>
            <option value="">Select user...</option>
            {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#8b949e]">Product</label>
          <select className={s.input} value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} required>
            <option value="">Select product...</option>
            {products.map(p => <option key={p._id} value={p._id}>{p.name} (${p.price}, stock: {p.stock})</option>)}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs text-[#8b949e]">Qty</label>
          <input className={s.input} type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <button type="submit" className={`${s.btn} bg-[#f0883e]`}>Place Order</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead><tr>{['ID', 'User', 'Items', 'Total', 'Status', 'Actions'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
          <tbody>{orders.map(o => (
            <tr key={o._id}>
              <td className={`${s.td} font-mono text-[11px]`}>{o._id?.slice(-8)}</td>
              <td className={s.td}>{o.userName || o.userId}</td>
              <td className={s.td}>{o.items?.map(i => `${i.productName} x${i.quantity}`).join(', ')}</td>
              <td className={s.td}>${o.totalAmount?.toFixed(2)}</td>
              <td className={s.td}><Badge color={STAT[o.status] || '#6e7681'}>{o.status}</Badge></td>
              <td className={s.td}>
                <div className="flex gap-1 items-center">
                  <button className={`${s.btnSm} bg-[#1f6feb]`} onClick={() => view(o._id)}>View</button>
                  <select className={`${s.input} !w-auto !p-1 text-xs`} value={o.status} onChange={e => update(o._id, e.target.value)}>
                    {['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {resp && <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 mt-3 max-h-96 overflow-y-auto">
        <strong className="text-[#58a6ff] text-xs">Response (inter-service flow):</strong>
        <pre className="mt-2 text-[#3fb950] text-xs">{JSON.stringify(resp, null, 2)}</pre>
      </div>}
    </div>
  );
}

/* ════════════════════ MAIN PAGE ════════════════════ */
export default function Home() {
  const [tab, setTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'users', label: '👤 Users' },
    { id: 'products', label: '📦 Products' },
    { id: 'orders', label: '🛒 Orders' },
    { id: 'traffic', label: '📡 Traffic' },
  ];

  return (
    <div className="p-4">
      <div className="text-center mb-6 p-5 bg-gradient-to-br from-[#161b22] to-[#1c2333] rounded-xl border border-[#30363d]">
        <h1 className="text-3xl font-bold text-[#58a6ff]">ECS Microservices Dashboard</h1>
        <p className="text-sm text-[#8b949e] mt-2">Next.js • 3 Microservices • Direct Service Calls • AWS ECS Ready</p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 border-none rounded-lg cursor-pointer text-sm font-semibold transition-all ${tab === t.id ? 'bg-[#238636] text-white' : 'bg-[#21262d] text-[#8b949e]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <><EnvInfo /><ArchitectureDiagram /><HealthPanel /><TrafficPanel /></>}
      {tab === 'users' && <UsersPanel />}
      {tab === 'products' && <ProductsPanel />}
      {tab === 'orders' && <OrdersPanel />}
      {tab === 'traffic' && <TrafficPanel />}
    </div>
  );
}
