import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Coffee, Settings, ShoppingBag, Check, ChevronLeft, Snowflake, Flame, Bell, BellOff, Lock, LogOut, X, Inbox } from 'lucide-react';
import { onSnapshot, setDoc, addDoc, updateDoc, collection, query, where, orderBy, doc, serverTimestamp, increment } from 'firebase/firestore';
import { MENU_DOC, db } from './firebase';
import { pushSupported, checkSubscribed, subscribeToPush, unsubscribeFromPush, notifyOrder } from './push';
import { ADMIN_PASSWORD, THEME_NAME } from './config';
import { getTheme } from './themes';

const ADMIN_AUTH_KEY = 'caffe-admin-ok';

// Active theme — driven by THEME_NAME in config.js
const THEME = getTheme(THEME_NAME);
const COLORS = THEME.colors;
const FONTS_LINK = THEME.fontsLink;

const BASE_DRINKS = [
  { id: 'single', name: 'Single Shot', desc: 'One pure shot of espresso', group: 'shots', temps: ['hot'] },
  { id: 'doppio', name: 'Doppio', desc: 'A double shot, twice the depth', group: 'shots', temps: ['hot'] },
  { id: 'americano', name: 'Americano', desc: 'Espresso lengthened with water', group: 'shots', temps: ['hot', 'iced'] },
  { id: 'macchiato', name: 'Macchiato', desc: 'Espresso marked with a dollop of foam', group: 'milk', temps: ['hot', 'iced'] },
  { id: 'cappuccino', name: 'Cappuccino', desc: 'Equal parts espresso, milk, and foam', group: 'milk', temps: ['hot'] },
  { id: 'flatwhite', name: 'Flat White', desc: 'Velvety microfoam over a double shot', group: 'milk', temps: ['hot'] },
  { id: 'latte', name: 'Caffè Latte', desc: 'Smooth espresso with milk', group: 'milk', temps: ['hot', 'iced'] },
  { id: 'breve', name: 'Breve', desc: 'Espresso with half-and-half', group: 'milk', temps: ['hot', 'iced'] },
  { id: 'mocha', name: 'Mocha', desc: 'Espresso, chocolate, and milk', group: 'milk', temps: ['hot', 'iced'] },
  { id: 'frappuccino', name: 'Frappuccino', desc: 'Blended espresso with milk and ice', group: 'milk', temps: ['iced'] },
];

// Final drink list: base + any theme-exclusive drinks
const ESPRESSO_BASES = [...BASE_DRINKS, ...(THEME.exclusiveDrinks || [])];

const DEFAULT_ADDONS = {
  syrups: [
    { id: 's1', name: 'Vanilla', price: 0.75 },
    { id: 's2', name: 'French Vanilla', price: 0.75 },
    { id: 's3', name: 'Salted Caramel', price: 0.75 },
    { id: 's4', name: 'Hazelnut', price: 0.75 },
  ],
  spices: [
    { id: 'sp1', name: 'Pumpkin Spice', price: 0.75 },
    { id: 'sp2', name: 'Cinnamon', price: 0.5 },
  ],
  extras: [
    { id: 'e1', name: 'Extra Shot', price: 1.25 },
    { id: 'e2', name: 'Whipped Cream', price: 0.5 },
  ],
};

const CATEGORY_LABELS = {
  syrups: 'Syrups',
  spices: 'Spice & Seasonal',
  extras: 'Extras',
};

// Sweetness slider — discrete modes, each maps to a pump count
const SWEETNESS_MODES = [
  { id: 'perfect', label: 'Slightly Sweetened', pumps: 1 },
  { id: 'notbad', label: 'Not a bad choice', pumps: 1.5 },
  { id: 'over', label: 'Over sweetened', pumps: 2 },
  { id: 'disgusting', label: 'Disgusting', pumps: 2.5 },
];

const pumpLabel = (pumps) => `${pumps} pump${pumps === 1 ? '' : 's'}`;

// The sweetness slider only applies to a real, sweetened syrup choice
const sweetenedSyrup = (selected, addons) => {
  const syrup = addons.syrups?.find((s) => selected.syrups.includes(s.id));
  return syrup && syrup.name !== 'Unsweetened' ? syrup : null;
};

// Readable list of chosen add-ons; the syrup carries its pump count when sweetened
const buildAddonsList = (selected, addons, sweetness) => {
  const list = [];
  ['syrups', 'spices', 'extras'].forEach((cat) => {
    selected[cat].forEach((id) => {
      const item = addons[cat]?.find((a) => a.id === id);
      if (!item) return;
      if (cat === 'syrups' && item.name !== 'Unsweetened') {
        list.push(`${item.name} · ${pumpLabel(SWEETNESS_MODES[sweetness].pumps)}`);
      } else {
        list.push(item.name);
      }
    });
  });
  return list;
};

export default function App() {
  const [view, setView] = useState('order');
  const [addons, setAddons] = useState(DEFAULT_ADDONS);
  const [loading, setLoading] = useState(true);
  const [temp, setTemp] = useState(null);
  const [base, setBase] = useState(null);
  const [selected, setSelected] = useState({ syrups: [], spices: [], extras: [] });
  const [sweetness, setSweetness] = useState(0);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [askingName, setAskingName] = useState(false);
  const [decaf, setDecaf] = useState(false);

  // Realtime sync from Firebase
  useEffect(() => {
    const unsub = onSnapshot(
      MENU_DOC,
      (snap) => {
        if (snap.exists()) {
          setAddons({ ...DEFAULT_ADDONS, ...snap.data() });
        } else if (!snap.metadata.fromCache) {
          // Doc is genuinely missing on the SERVER (true first run) — seed defaults.
          // Guard against cache-miss snapshots: onSnapshot also fires from the local
          // cache, where an existing server doc can look non-existent. Seeding on that
          // false negative would overwrite the real saved menu with the defaults.
          setDoc(MENU_DOC, DEFAULT_ADDONS).catch(console.error);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Firebase error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const saveMenu = async (next) => {
    setAddons(next);
    try {
      await setDoc(MENU_DOC, next);
    } catch (e) {
      console.error('save failed', e);
      alert('Could not save. Check your Firebase setup.');
    }
  };

  const toggleSelected = (cat, id) => {
    setSelected((s) => {
      const has = s[cat].includes(id);
      // Syrups are single-select — picking one replaces any previous choice
      if (cat === 'syrups') return { ...s, syrups: has ? [] : [id] };
      return { ...s, [cat]: has ? s[cat].filter((x) => x !== id) : [...s[cat], id] };
    });
  };

  const baseObj = ESPRESSO_BASES.find((b) => b.id === base);

  // Step 1 — user tapped "Place order" — open the name sheet
  const requestPlaceOrder = () => setAskingName(true);

  // Step 2 — name confirmed — save to Firestore, send notification, show success
  const submitOrder = async (customerName) => {
    const trimmed = (customerName || '').trim() || 'Anonymous';

    // Build readable strings
    const tempLabel = temp ? temp.charAt(0).toUpperCase() + temp.slice(1) : '';
    const addonsList = buildAddonsList(selected, addons, sweetness);
    const decafLabel = decaf ? 'Decaf ' : '';
    const orderText = `${tempLabel} ${decafLabel}${baseObj?.name || ''}${addonsList.length ? ' · ' + addonsList.join(', ') : ''}`.trim();

    // Primary path: hand the whole order to the server, which saves it AND
    // sends the push itself — so the notification no longer depends on this
    // browser staying alive. `keepalive` lets the request finish even if the
    // tab is closed right after ordering; one retry covers a transient blip.
    const orderPayload = {
      order: {
        customerName: trimmed,
        temp,
        decaf,
        drink: baseObj?.name || '',
        addons: addonsList,
        summary: orderText,
      },
      notify: { title: THEME.notifyTitle, body: `${trimmed} — ${orderText}` },
    };

    let serverOk = false;
    for (let attempt = 0; attempt < 2 && !serverOk; attempt++) {
      try {
        const res = await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(orderPayload),
        });
        serverOk = res.ok;
      } catch (e) {
        console.error(`order submit attempt ${attempt + 1} failed`, e);
      }
    }

    // Fallback: if the server endpoint was unreachable, save the order
    // client-side (resilient/offline-queued) and fire the old notify path so
    // the order is never silently lost.
    if (!serverOk) {
      try {
        await addDoc(collection(db, 'orders'), {
          customerName: trimmed,
          temp,
          decaf,
          drink: baseObj?.name || '',
          addons: addonsList,
          summary: orderText,
          status: 'open',
          createdAt: serverTimestamp(),
        });
        await setDoc(
          doc(db, 'stats', 'global'),
          { totalOrders: increment(1), lastOrderAt: serverTimestamp() },
          { merge: true }
        );
      } catch (e) {
        console.error('order save fallback failed', e);
      }
      notifyOrder(`${trimmed} — ${orderText}`, THEME.notifyTitle);
    }

    setAskingName(false);
    setOrderPlaced(true);
    setTimeout(() => {
      setOrderPlaced(false);
      setTemp(null);
      setBase(null);
      setDecaf(false);
      setSelected({ syrups: [], spices: [], extras: [] });
      setSweetness(0);
    }, 3500);
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        overflowX: 'hidden',
        background: COLORS.paper,
        fontFamily: THEME.sansFont,
        color: COLORS.espresso,
        backgroundImage: COLORS.starfield
          ? `radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 75% 65%, #fff, transparent), radial-gradient(1px 1px at 35% 80%, #fff8, transparent), radial-gradient(2px 2px at 85% 15%, #fff, transparent), radial-gradient(1px 1px at 60% 40%, #fff6, transparent), radial-gradient(1px 1px at 10% 70%, #fffa, transparent), radial-gradient(2px 2px at 90% 50%, #fff, transparent), radial-gradient(1px 1px at 50% 10%, #fff7, transparent), radial-gradient(1px 1px at 25% 55%, #fff8, transparent), radial-gradient(1px 1px at 70% 90%, #fff6, transparent), radial-gradient(circle at 50% 50%, ${COLORS.copper}10 0%, transparent 60%)`
          : `radial-gradient(circle at 20% 10%, ${COLORS.creamDark}55 0%, transparent 50%), radial-gradient(circle at 80% 90%, ${COLORS.copper}15 0%, transparent 40%)`,
        backgroundAttachment: 'fixed',
        backgroundSize: COLORS.starfield ? '100% 100%' : 'auto',
      }}
    >
      <link rel="stylesheet" href={FONTS_LINK} />
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          0%   { opacity: 0; transform: scale(0.3); }
          60%  { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ringPulse {
          0%   { opacity: 0.7; transform: scale(0.6); }
          100% { opacity: 0; transform: scale(2.2); }
        }
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes shimmerNew {
          0% { box-shadow: 0 0 0 0 var(--accent, ${COLORS.copper}66); }
          100% { box-shadow: 0 0 0 12px transparent; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        @keyframes confettiOut {
          0%   { opacity: 1; transform: translate(0,0) scale(1); }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.5); }
        }
        @keyframes fwBurst {
          0%   { opacity: 0; transform: translate(0,0) scale(0.3); }
          8%   { opacity: 1; transform: translate(calc(var(--dx) * 0.12), calc(var(--dy) * 0.12)) scale(1); }
          45%  { opacity: 1; transform: translate(var(--dx), var(--dy)) scale(1); }
          75%  { opacity: 0; transform: translate(calc(var(--dx) * 1.18), calc(var(--dy) * 1.18 + 16px)) scale(0.55); }
          100% { opacity: 0; transform: translate(calc(var(--dx) * 1.18), calc(var(--dy) * 1.18 + 16px)) scale(0.5); }
        }
        @keyframes fwFlash {
          0%   { opacity: 0; transform: scale(0.2); }
          5%   { opacity: 1; transform: scale(1); }
          22%  { opacity: 0; transform: scale(1.8); }
          100% { opacity: 0; transform: scale(1.8); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fw-particle, .fw-flash { animation: none !important; opacity: 0 !important; }
        }
        @keyframes pageInRight {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes pageInLeft {
          from { opacity: 0; transform: translateX(-28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes barIn {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .step-enter { animation: fadeUp 0.45s ease-out both; }
        .new-order { animation: fadeUp 0.45s ease-out both, shimmerNew 1.2s ease-out 0.1s both; }
        button { transition: transform 0.12s ease-out, background 0.18s ease-out, color 0.18s ease-out, border-color 0.18s ease-out; }
        button:active { transform: scale(0.97); }
        .chip { transition: background 0.18s ease-out, color 0.18s ease-out, border-color 0.18s ease-out; }
        .sweet-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 40px; margin: 0; background: transparent; cursor: pointer; touch-action: none; }
        .sweet-slider:focus { outline: none; }
        .sweet-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: ${COLORS.copper}33; }
        .sweet-slider::-moz-range-track { height: 6px; border-radius: 999px; background: ${COLORS.copper}33; }
        .sweet-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 30px; height: 30px; margin-top: -12px; border-radius: 50%; background: ${COLORS.copper}; border: 3px solid ${COLORS.paper}; box-shadow: 0 1px 5px rgba(0,0,0,0.28); }
        .sweet-slider::-moz-range-thumb { width: 30px; height: 30px; border-radius: 50%; background: ${COLORS.copper}; border: 3px solid ${COLORS.paper}; box-shadow: 0 1px 5px rgba(0,0,0,0.28); }
      `}</style>

      {/* Fireworks night sky (4th of July theme) */}
      {COLORS.fireworks && (() => {
        const bursts = [
          { x: '16%', y: '20%', count: 16, radius: 64, dur: 2.6, delay: 0.0, color: COLORS.copperDark },
          { x: '78%', y: '16%', count: 18, radius: 76, dur: 3.0, delay: 0.7, color: COLORS.ice },
          { x: '50%', y: '12%', count: 20, radius: 84, dur: 2.8, delay: 1.4, color: '#ffffff' },
          { x: '30%', y: '30%', count: 14, radius: 58, dur: 2.4, delay: 2.1, color: '#ffd95a' },
          { x: '86%', y: '34%', count: 16, radius: 68, dur: 3.2, delay: 1.0, color: COLORS.copper },
          { x: '64%', y: '28%', count: 18, radius: 72, dur: 2.7, delay: 2.6, color: COLORS.ice },
        ];
        return (
          <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
            {bursts.map((b, bi) => (
              <div key={bi} style={{ position: 'absolute', left: b.x, top: b.y, width: 0, height: 0 }}>
                <span
                  className="fw-flash"
                  style={{
                    position: 'absolute',
                    left: -7,
                    top: -7,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: b.color,
                    boxShadow: `0 0 18px 6px ${b.color}`,
                    animation: `fwFlash ${b.dur}s ease-out ${b.delay}s infinite`,
                  }}
                />
                {Array.from({ length: b.count }).map((_, i) => {
                  const angle = (Math.PI * 2 * i) / b.count;
                  const dx = Math.cos(angle) * b.radius;
                  const dy = Math.sin(angle) * b.radius;
                  return (
                    <span
                      key={i}
                      className="fw-particle"
                      style={{
                        position: 'absolute',
                        left: -2.5,
                        top: -2.5,
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: b.color,
                        boxShadow: `0 0 6px ${b.color}`,
                        '--dx': `${dx}px`,
                        '--dy': `${dy}px`,
                        animation: `fwBurst ${b.dur}s ease-out ${b.delay}s infinite`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Header */}
      <header
        style={{
          padding: 'calc(10px + env(safe-area-inset-top)) 20px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${COLORS.espresso}15`,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: `${COLORS.paper}f2`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: COLORS.ctaBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Coffee size={16} color={COLORS.ctaText} />
          </div>
          <div>
            <div style={{ fontFamily: THEME.serifFont, fontWeight: 600, fontSize: 20, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {THEME.brandName}
            </div>
            <div style={{ fontFamily: THEME.monoFont, fontSize: 9, letterSpacing: '0.2em', color: COLORS.copperDark, textTransform: 'uppercase', marginTop: 2 }}>
              {THEME.tagline}
            </div>
          </div>
        </div>
        <button
          onClick={() => setView(view === 'order' ? 'admin' : 'order')}
          style={{
            padding: '8px 12px',
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            background: view === 'admin' ? COLORS.selectedBg : 'transparent',
            color: view === 'admin' ? COLORS.selectedText : COLORS.espresso,
            border: `1px solid ${COLORS.espresso}30`,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {view === 'order' ? (
            <>
              <Settings size={13} /> Menu
            </>
          ) : (
            <>
              <ChevronLeft size={13} /> Order
            </>
          )}
        </button>
      </header>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '128px 0', color: COLORS.copperDark }}>
            <div style={{ fontFamily: THEME.monoFont, fontSize: 11, letterSpacing: '0.2em' }}>
              {THEME.brewingLabel}
            </div>
          </div>
        ) : view === 'order' ? (
          <OrderView {...{ temp, setTemp, base, setBase, addons, selected, setSelected, toggleSelected, sweetness, setSweetness, baseObj, decaf, setDecaf, requestPlaceOrder, submitOrder, askingName, setAskingName, orderPlaced }} />
        ) : (
          <AdminView addons={addons} saveMenu={saveMenu} />
        )}
      </div>
    </div>
  );
}

function OrderView({ temp, setTemp, base, setBase, addons, selected, setSelected, toggleSelected, sweetness, setSweetness, baseObj, decaf, setDecaf, requestPlaceOrder, submitOrder, askingName, setAskingName, orderPlaced }) {
  // Paged flow: 0 temp · 1 drink · 2 caffeine · 3 customize
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const touch = useRef({ x: 0, y: 0 });

  // Jump back to the first page whenever a fresh order starts (post-success reset)
  useEffect(() => {
    if (!temp && !base) setStep(0);
  }, [temp, base]);

  if (orderPlaced) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Confetti — small dots radiating from the check */}
        <div style={{ position: 'absolute', top: '96px', left: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
          {Array.from({ length: 14 }).map((_, i) => {
            const angle = (Math.PI * 2 * i) / 14;
            const dx = Math.cos(angle) * 90;
            const dy = Math.sin(angle) * 90;
            const colors = [COLORS.copper, COLORS.copperDark, COLORS.ice, COLORS.ctaBg];
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  top: 40,
                  left: 0,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: colors[i % colors.length],
                  '--dx': `${dx}px`,
                  '--dy': `${dy}px`,
                  animation: `confettiOut 0.9s ease-out ${0.15 + (i * 0.02)}s both`,
                }}
              />
            );
          })}
        </div>

        {/* Pulsing ring behind the check */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: COLORS.ctaBg,
            animation: 'ringPulse 0.9s ease-out 0.1s both',
          }} />
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: COLORS.ctaBg,
            animation: 'popIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            position: 'relative',
          }}>
            <Check size={36} color={COLORS.ctaText} strokeWidth={2.5} />
          </div>
        </div>

        <h2 style={{
          fontFamily: THEME.serifFont, fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0,
          animation: 'fadeUp 0.5s ease-out 0.35s both',
        }}>
          Your order is in.
        </h2>
        <p style={{
          marginTop: 12, fontSize: 14, opacity: 0.7,
          animation: 'fadeUp 0.5s ease-out 0.5s both',
        }}>We'll have it ready in a few minutes.</p>
        <div style={{
          marginTop: 24, padding: '8px 16px', borderRadius: 999,
          fontFamily: THEME.monoFont, fontSize: 11, letterSpacing: '0.2em',
          background: COLORS.selectedBg, color: COLORS.selectedText, border: `1px solid ${COLORS.copper}40`,
          animation: 'fadeUp 0.5s ease-out 0.65s both',
        }}>
          {temp?.toUpperCase()} {decaf ? 'DECAF ' : ''}{baseObj?.name.toUpperCase()}
        </div>
      </div>
    );
  }

  const shotBases = ESPRESSO_BASES.filter((b) => b.group === 'shots' && b.temps.includes(temp));
  const milkBases = ESPRESSO_BASES.filter((b) => b.group === 'milk' && b.temps.includes(temp));

  const go = (n) => { setDir(n > step ? 1 : -1); setStep(n); };
  const back = () => go(step - 1);

  // Auto-advance, but pause briefly so the tapped option's highlight is visible
  const advance = (n) => setTimeout(() => go(n), 170);
  const chooseTemp = (t) => {
    if (base) {
      const stillValid = ESPRESSO_BASES.find((b) => b.id === base)?.temps.includes(t);
      if (!stillValid) setBase(null);
    }
    // Whipped cream isn't offered on hot drinks — drop it if switching to hot
    if (t === 'hot') {
      const whipIds = (addons.extras || []).filter((e) => e.name === 'Whipped Cream').map((e) => e.id);
      if (whipIds.length) {
        setSelected((s) => ({ ...s, extras: s.extras.filter((id) => !whipIds.includes(id)) }));
      }
    }
    setTemp(t);
    advance(1);
  };
  const chooseBase = (id) => {
    setBase(id);
    // Mocha hides syrups & spices — drop any earlier picks so they don't ride along
    if (id === 'mocha') {
      setSelected((s) => ({ ...s, syrups: [], spices: [] }));
      setSweetness(0);
    }
    advance(2);
  };
  const chooseCaffeine = (v) => { setDecaf(v); advance(3); };

  // Swipe right to go back a page
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    if (step > 0 && dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) back();
  };

  const STEP_LABELS = ['01 · Hot or iced', '02 · Choose your drink', '03 · Caffeine', '04 · Make it yours'];

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: step === 3 ? '20px 20px 128px' : '20px 20px 40px',
      }}
    >
      {/* Segmented progress */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            onClick={() => i < step && go(i)}
            aria-label={`Step ${i + 1}`}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 999,
              border: 'none',
              padding: 0,
              background: i <= step ? COLORS.copper : COLORS.espresso + '20',
              cursor: i < step ? 'pointer' : 'default',
              transition: 'background 0.35s ease',
            }}
          />
        ))}
      </div>

      <div
        key={step}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          animation: `${dir > 0 ? 'pageInRight' : 'pageInLeft'} 0.45s cubic-bezier(0.33, 1, 0.68, 1) both`,
        }}
      >
        {/* Page header — hero on the first page, back + label after */}
        {step === 0 ? (
          <div style={{ marginBottom: 32 }}>
            <div style={sectionLabelStyle}>{THEME.heroPre}</div>
            <h1 style={{ fontFamily: THEME.serifFont, fontSize: 44, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.03em', margin: 0 }}>
              {THEME.heroLine[0]}<em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>{THEME.heroLine[1]}</em>{THEME.heroLine[2]}
            </h1>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <button
              onClick={back}
              aria-label="Back"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: COLORS.cream, color: COLORS.espresso,
                border: `1px solid ${COLORS.espresso}15`, cursor: 'pointer', flexShrink: 0,
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <div style={{ ...sectionLabelStyle, marginBottom: 0 }}>{STEP_LABELS[step]}</div>
          </div>
        )}

        {/* Step 0 — temperature */}
        {step === 0 && (
          <>
            <SectionLabel>{STEP_LABELS[0]}</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { t: 'hot', icon: <Flame size={30} />, label: 'Hot', color: COLORS.hotColor },
                { t: 'iced', icon: <Snowflake size={30} />, label: 'Iced', color: COLORS.ice },
              ].map((o, i) => (
                <div key={o.t} style={{ animation: `fadeUp 0.45s ease-out ${i * 80}ms both` }}>
                  <TempButton active={temp === o.t} large onClick={() => chooseTemp(o.t)} icon={o.icon} label={o.label} activeColor={o.color} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Step 1 — drink */}
        {step === 1 && (
          <>
            {shotBases.length > 0 && (
              <>
                <SubLabel>Espresso shots</SubLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {shotBases.map((b, i) => (
                    <div key={b.id} style={{ animation: `fadeUp 0.4s ease-out ${i * 45}ms both` }}>
                      <BaseButton item={b} active={base === b.id} onClick={() => chooseBase(b.id)} />
                    </div>
                  ))}
                </div>
              </>
            )}
            {milkBases.length > 0 && (
              <>
                <SubLabel>Espresso with milk</SubLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {milkBases.map((b, i) => (
                    <div key={b.id} style={{ animation: `fadeUp 0.4s ease-out ${(shotBases.length + i) * 45}ms both` }}>
                      <BaseButton item={b} active={base === b.id} onClick={() => chooseBase(b.id)} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Step 2 — caffeine */}
        {step === 2 && (
          <>
            <p style={{ fontSize: 14, opacity: 0.7, marginTop: 0, marginBottom: 18 }}>
              How do you want your {baseObj?.name}?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { v: false, label: 'Regular', desc: 'Full caffeine, full lift' },
                { v: true, label: 'Decaf', desc: 'All the flavor, none of the buzz' },
              ].map((o, i) => (
                <div key={o.label} style={{ animation: `fadeUp 0.4s ease-out ${i * 70}ms both` }}>
                  <button
                    onClick={() => chooseCaffeine(o.v)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 16,
                      background: decaf === o.v ? COLORS.selectedBg : COLORS.cream,
                      color: decaf === o.v ? COLORS.selectedText : COLORS.espresso,
                      border: `1px solid ${decaf === o.v ? COLORS.copper : COLORS.espresso + '15'}`,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontFamily: THEME.serifFont, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>{o.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{o.desc}</div>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Step 3 — customize (all add-ons on one page) */}
        {step === 3 && (
          <>
            <p style={{ fontSize: 14, opacity: 0.7, marginTop: 0, marginBottom: 20 }}>
              Optional — tap to add, then place your order.
            </p>
            {/* A mocha is already chocolate-sweet — no syrups or seasonal spices */}
            {(base === 'mocha' ? ['extras'] : ['syrups', 'spices', 'extras']).map((cat, ci) => {
              // Whipped cream isn't offered on hot drinks
              const items = (addons[cat] || []).filter(
                (item) => !(cat === 'extras' && temp === 'hot' && item.name === 'Whipped Cream')
              );
              return items.length > 0 && (
                <div key={cat} style={{ marginBottom: 22, animation: `fadeUp 0.4s ease-out ${ci * 70}ms both` }}>
                  <SubLabel>{CATEGORY_LABELS[cat]}</SubLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {items.map((item) => {
                      const isOn = selected[cat].includes(item.id);
                      return (
                        <button
                          key={item.id}
                          className="chip"
                          onClick={() => toggleSelected(cat, item.id)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 999,
                            fontSize: 14,
                            fontWeight: 500,
                            background: isOn ? COLORS.copper : 'transparent',
                            color: isOn ? COLORS.paper : COLORS.espresso,
                            border: `1px solid ${isOn ? COLORS.copper : COLORS.espresso + '30'}`,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                  {/* Sweetness lives under the syrup picker, once a sweetened syrup is chosen */}
                  {cat === 'syrups' && sweetenedSyrup(selected, addons) && (
                    <SweetnessSlider value={sweetness} onChange={setSweetness} />
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {step === 3 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
            background: COLORS.paper,
            borderTop: `1px solid ${COLORS.espresso}15`,
            backdropFilter: 'blur(10px)',
            animation: 'barIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <button
            onClick={requestPlaceOrder}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: COLORS.ctaBg,
              color: COLORS.ctaText,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            <ShoppingBag size={16} />
            <span style={{ fontWeight: 500, fontSize: 14 }}>Place order</span>
          </button>
        </div>
      )}

      {askingName && (
        <NameSheet
          orderSummary={`${temp ? temp[0].toUpperCase() + temp.slice(1) : ''} ${decaf ? 'Decaf ' : ''}${baseObj?.name || ''}`.trim()}
          orderAddons={buildAddonsList(selected, addons, sweetness)}
          onCancel={() => setAskingName(false)}
          onConfirm={submitOrder}
        />
      )}
    </div>
  );
}

function NameSheet({ orderSummary, orderAddons = [], onCancel, onConfirm }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Lock page scroll behind the sheet (iOS ignores overflow:hidden, so pin the
  // body with position:fixed and restore the scroll position on close).
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    await onConfirm(name);
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 15, 8, 0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.25s ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 500,
          background: COLORS.paper,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
          animation: 'slideUpSheet 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={sectionLabelStyle}>— Last step</div>
            <h2 style={{ fontFamily: THEME.serifFont, fontSize: 28, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
              What's your <em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>name</em>?
            </h2>
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 12,
              background: COLORS.cream,
              border: `1px solid ${COLORS.espresso}10`,
            }}>
              <div style={{ fontFamily: THEME.serifFont, fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {orderSummary}
              </div>
              {orderAddons.length > 0 && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {orderAddons.join(' · ')}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: COLORS.cream,
              color: COLORS.espressoLight,
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) submit(); }}
          placeholder="First name"
          maxLength={40}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 14,
            fontSize: 16,
            outline: 'none',
            background: COLORS.cream,
            border: `1px solid ${COLORS.espresso}20`,
            fontFamily: THEME.sansFont,
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />

        <button
          onClick={submit}
          disabled={!name.trim() || busy}
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 600,
            background: COLORS.ctaBg,
            color: COLORS.ctaText,
            border: 'none',
            cursor: (!name.trim() || busy) ? 'not-allowed' : 'pointer',
            opacity: (!name.trim() || busy) ? 0.4 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? 'Sending...' : 'Confirm order'}
        </button>
      </div>
    </div>
  );
}

function TempButton({ active, onClick, icon, label, activeColor, large }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: large ? '40px 0' : '20px 0',
        borderRadius: 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: large ? 14 : 8,
        background: active ? activeColor : COLORS.cream,
        color: active ? COLORS.paper : COLORS.espresso,
        border: `1px solid ${active ? activeColor : COLORS.espresso + '15'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: large ? `0 4px 16px ${COLORS.espresso}0c` : 'none',
      }}
    >
      {icon}
      <span style={{ fontFamily: THEME.serifFont, fontSize: large ? 22 : 17, fontWeight: 500, letterSpacing: '-0.01em' }}>{label}</span>
    </button>
  );
}

function BaseButton({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: active ? COLORS.selectedBg : COLORS.cream,
        color: active ? COLORS.selectedText : COLORS.espresso,
        border: `1px solid ${active ? COLORS.copper : COLORS.espresso + '15'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: THEME.serifFont, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>{item.name}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{item.desc}</div>
      </div>
    </button>
  );
}

function SubLabel({ children }) {
  return (
    <div style={{ fontFamily: THEME.serifFont, fontStyle: 'italic', fontSize: 13, color: COLORS.copperDark, marginBottom: 8, marginTop: 2 }}>
      {children}
    </div>
  );
}

// Discrete sweetness control — drag the slider or tap a stop; each maps to a pump count
function SweetnessSlider({ value, onChange }) {
  const mode = SWEETNESS_MODES[value];
  const last = SWEETNESS_MODES.length - 1;
  return (
    <div
      // Keep slider drags from registering as a page swipe-back gesture
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        marginTop: 12,
        padding: '14px 16px',
        borderRadius: 16,
        background: COLORS.cream,
        border: `1px solid ${COLORS.espresso}15`,
        animation: 'fadeUp 0.3s ease-out both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: THEME.serifFont, fontStyle: 'italic', fontSize: 16, color: COLORS.espresso }}>
          {mode.label}
        </span>
        <span style={{ fontFamily: THEME.monoFont, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.copperDark }}>
          {pumpLabel(mode.pumps)}
        </span>
      </div>
      <input
        className="sweet-slider"
        type="range"
        min={0}
        max={last}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Sweetness"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {SWEETNESS_MODES.map((m, i) => (
          <button
            key={m.id}
            onClick={() => onChange(i)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              padding: '2px 0',
              cursor: 'pointer',
              fontFamily: THEME.monoFont,
              fontSize: 10,
              textAlign: i === 0 ? 'left' : i === last ? 'right' : 'center',
              color: i === value ? COLORS.copperDark : COLORS.espresso + '70',
              fontWeight: i === value ? 700 : 400,
            }}
          >
            {m.pumps}
          </button>
        ))}
      </div>
    </div>
  );
}

const sectionLabelStyle = {
  fontFamily: THEME.monoFont,
  fontSize: 10,
  letterSpacing: '0.2em',
  color: COLORS.copperDark,
  textTransform: 'uppercase',
  marginBottom: 12,
};

function SectionLabel({ children }) {
  return <div style={sectionLabelStyle}>{children}</div>;
}

function NotifToggle() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pushSupported()) {
      setSupported(false);
      return;
    }
    checkSubscribed().then(setEnabled).catch(() => {});
  }, []);

  const toggle = async () => {
    setError(null);
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
      } else {
        await subscribeToPush();
        setEnabled(true);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div style={{
        padding: 14,
        borderRadius: 16,
        marginBottom: 16,
        background: COLORS.cream,
        border: `1px solid ${COLORS.espresso}10`,
        fontSize: 13,
        opacity: 0.8,
      }}>
        Notifications aren't supported on this browser. On iPhone, add {THEME.brandName} to your home screen and open it from there.
      </div>
    );
  }

  return (
    <div style={{
      padding: 14,
      borderRadius: 16,
      marginBottom: 16,
      background: enabled ? COLORS.selectedBg : COLORS.cream,
      color: enabled ? COLORS.selectedText : COLORS.espresso,
      border: `1px solid ${enabled ? COLORS.copper : COLORS.espresso + '10'}`,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: enabled ? COLORS.copper : COLORS.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {enabled ? <Bell size={16} color={COLORS.ctaText} /> : <BellOff size={16} color={COLORS.espressoLight} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: THEME.serifFont, fontSize: 15, fontWeight: 500 }}>
              Order alerts
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              {enabled ? 'On — this device will buzz on each order' : 'Get a notification on each new order'}
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: enabled ? COLORS.cream : COLORS.ctaBg,
            color: enabled ? COLORS.espresso : COLORS.ctaText,
            border: 'none',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.5 : 1,
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          {busy ? '...' : enabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      {error && (
        <div style={{
          marginTop: 10,
          fontSize: 12,
          padding: '8px 10px',
          borderRadius: 8,
          background: COLORS.danger + '22',
          color: COLORS.danger,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function TotalStat() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'stats', 'global'),
      (snap) => {
        setTotal(snap.exists() ? (snap.data().totalOrders || 0) : 0);
      },
      (err) => {
        console.error('stats listen failed', err);
        setTotal(0);
      }
    );
    return unsub;
  }, []);

  return (
    <div style={{
      marginBottom: 24,
      padding: '18px 20px',
      borderRadius: 16,
      background: COLORS.selectedBg,
      color: COLORS.selectedText,
      border: `1px solid ${COLORS.copper}40`,
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div style={{
        fontFamily: THEME.monoFont,
        fontSize: 10,
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        opacity: 0.7,
        flex: 1,
      }}>
        Drinks served · all time
      </div>
      <div style={{
        fontFamily: THEME.serifFont,
        fontSize: 36,
        fontWeight: 700,
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}>
        {total === null ? '—' : total.toLocaleString()}
      </div>
    </div>
  );
}

function OpenOrders() {
  const [orders, setOrders] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error('orders listen failed', err);
      }
    );
    return unsub;
  }, []);

  const completeOrder = async (id) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, 'orders', id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('complete failed', e);
    } finally {
      setBusyId(null);
    }
  };

  const fmtTime = (ts) => {
    if (!ts || !ts.toDate) return '';
    const d = ts.toDate();
    const now = new Date();
    const diffMs = now - d;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={sectionLabelStyle}>
          <Inbox size={11} style={{ display: 'inline', marginRight: 6, verticalAlign: '-1px' }} />
          Open orders · {orders.length}
        </div>
      </div>

      {orders.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '28px 16px',
          borderRadius: 16,
          fontSize: 13,
          opacity: 0.6,
          background: COLORS.cream,
          fontStyle: 'italic',
          border: `1px solid ${COLORS.espresso}10`,
        }}>
          No open orders. You're all caught up.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map((o) => (
            <div
              key={o.id}
              className="step-enter"
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: COLORS.selectedBg,
                color: COLORS.selectedText,
                border: `1px solid ${COLORS.copper}40`,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: THEME.serifFont, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
                    {o.customerName || 'Anonymous'}
                  </div>
                  <div style={{ fontFamily: THEME.monoFont, fontSize: 10, letterSpacing: '0.15em', opacity: 0.6, textTransform: 'uppercase' }}>
                    {fmtTime(o.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
                  {o.summary}
                </div>
              </div>
              <button
                onClick={() => completeOrder(o.id)}
                disabled={busyId === o.id}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  background: COLORS.copper,
                  color: COLORS.paper,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: busyId === o.id ? 'wait' : 'pointer',
                  opacity: busyId === o.id ? 0.5 : 1,
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  alignSelf: 'flex-start',
                }}
              >
                <Check size={13} /> Done
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminView({ addons, saveMenu }) {
  const [authed, setAuthed] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_AUTH_KEY) === ADMIN_PASSWORD;
    } catch (e) {
      return false;
    }
  });

  if (!authed) {
    return <PasswordGate onSuccess={() => setAuthed(true)} />;
  }

  return <AdminPanel addons={addons} saveMenu={saveMenu} onSignOut={() => {
    try { localStorage.removeItem(ADMIN_AUTH_KEY); } catch (e) {}
    setAuthed(false);
  }} />;
}

function PasswordGate({ onSuccess }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (pw === ADMIN_PASSWORD) {
      try { localStorage.setItem(ADMIN_AUTH_KEY, ADMIN_PASSWORD); } catch (e) {}
      setError(false);
      onSuccess();
    } else {
      setError(true);
      setPw('');
    }
  };

  return (
    <div style={{ padding: '64px 24px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: COLORS.ctaBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <Lock size={26} color={COLORS.ctaText} />
      </div>
      <div style={{ fontFamily: THEME.monoFont, fontSize: 10, letterSpacing: '0.25em', color: COLORS.copperDark, textTransform: 'uppercase', marginBottom: 8 }}>
        — Owner only
      </div>
      <h1 style={{ fontFamily: THEME.serifFont, fontSize: 30, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', margin: 0 }}>
        Enter <em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>password</em>.
      </h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 10, marginBottom: 28, maxWidth: 280 }}>
        The menu and order alerts are restricted to the owner.
      </p>

      <input
        type="password"
        autoFocus
        value={pw}
        onChange={(e) => { setPw(e.target.value); setError(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Password"
        style={{
          width: '100%',
          maxWidth: 280,
          padding: '14px 16px',
          borderRadius: 14,
          fontSize: 15,
          textAlign: 'center',
          outline: 'none',
          background: COLORS.cream,
          border: `1px solid ${error ? '#c25555' : COLORS.espresso + '20'}`,
          fontFamily: THEME.sansFont,
          letterSpacing: pw ? '0.3em' : 'normal',
        }}
      />
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#c25555' }}>
          That's not the password.
        </div>
      )}
      <button
        onClick={submit}
        disabled={!pw}
        style={{
          marginTop: 16,
          width: '100%',
          maxWidth: 280,
          padding: '12px 0',
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 600,
          background: COLORS.ctaBg,
          color: COLORS.ctaText,
          border: 'none',
          cursor: pw ? 'pointer' : 'not-allowed',
          opacity: pw ? 1 : 0.4,
          fontFamily: 'inherit',
        }}
      >
        Unlock
      </button>
    </div>
  );
}

function AdminPanel({ addons, saveMenu, onSignOut }) {
  const [activeCat, setActiveCat] = useState('syrups');
  const [newName, setNewName] = useState('');

  const addItem = () => {
    const name = newName.trim();
    if (!name) return;
    const next = {
      ...addons,
      [activeCat]: [...(addons[activeCat] || []), { id: `${activeCat}${Date.now()}`, name }],
    };
    saveMenu(next);
    setNewName('');
  };

  const removeItem = (id) => {
    saveMenu({ ...addons, [activeCat]: addons[activeCat].filter((x) => x.id !== id) });
  };

  const placeholderName = { syrups: 'Cardamom', spices: 'Nutmeg', extras: 'Honey' }[activeCat];

  return (
    <div style={{ padding: '24px 20px 48px' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sectionLabelStyle}>{THEME.ownerHeroPre}</div>
          <h1 style={{ fontFamily: THEME.serifFont, fontSize: 34, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', margin: 0 }}>
            {THEME.ownerHeroLine[0]}<em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>{THEME.ownerHeroLine[1]}</em>{THEME.ownerHeroLine[2]}
          </h1>
          <p style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>Changes save instantly and appear for everyone.</p>
        </div>
        <button
          onClick={onSignOut}
          title="Sign out"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: COLORS.cream,
            color: COLORS.espressoLight,
            border: `1px solid ${COLORS.espresso}15`,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <LogOut size={15} />
        </button>
      </div>

      <NotifToggle />
      <TotalStat />
      <OpenOrders />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 20, padding: 4, borderRadius: 16, background: COLORS.cream }}>
        {Object.keys(CATEGORY_LABELS).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            style={{
              padding: '8px 4px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 500,
              background: activeCat === cat ? COLORS.selectedBg : 'transparent',
              color: activeCat === cat ? COLORS.selectedText : COLORS.espresso,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, borderRadius: 16, marginBottom: 20, background: COLORS.cream, border: `1px solid ${COLORS.espresso}10` }}>
        <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Add new</div>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
          placeholder={`Name (e.g. ${placeholderName})`}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 12, fontSize: 14, outline: 'none', minWidth: 0, background: COLORS.paper, border: `1px solid ${COLORS.espresso}20`, fontFamily: THEME.sansFont, marginBottom: 8, boxSizing: 'border-box' }}
        />
        <button
          onClick={addItem}
          disabled={!newName.trim()}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            background: COLORS.ctaBg,
            color: COLORS.ctaText,
            opacity: !newName.trim() ? 0.4 : 1,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus size={15} /> Add to {CATEGORY_LABELS[activeCat]}
        </button>
      </div>

      <SectionLabel>Current items · {addons[activeCat]?.length || 0}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!addons[activeCat]?.length ? (
          <div style={{ textAlign: 'center', padding: '40px 0', borderRadius: 16, fontSize: 14, opacity: 0.6, background: COLORS.cream, fontStyle: 'italic' }}>
            No items yet. Add one above.
          </div>
        ) : (
          addons[activeCat].map((item) => (
            <div key={item.id} style={{ padding: '12px 16px', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: COLORS.cream, border: `1px solid ${COLORS.espresso}10` }}>
              <div style={{ fontFamily: THEME.serifFont, fontSize: 16, fontWeight: 500 }}>{item.name}</div>
              <button
                onClick={() => removeItem(item.id)}
                style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.paper, color: COLORS.espressoLight, border: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
