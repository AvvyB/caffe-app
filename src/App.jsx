import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Coffee, Settings, ShoppingBag, Check, ChevronLeft, Snowflake, Flame, Bell, BellOff, Lock, LogOut, X, Inbox } from 'lucide-react';
import { onSnapshot, setDoc, addDoc, updateDoc, collection, query, where, orderBy, doc, serverTimestamp } from 'firebase/firestore';
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
  { id: 'mocha', name: 'Mocha', desc: 'Espresso, chocolate, and milk', group: 'milk', temps: ['hot', 'iced'] },
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
  milks: [
    { id: 'm1', name: 'Whole Milk', price: 0.5 },
    { id: 'm2', name: 'Oat Milk', price: 0.75 },
    { id: 'm3', name: 'Almond Milk', price: 0.75 },
  ],
  extras: [
    { id: 'e1', name: 'Extra Shot', price: 1.25 },
    { id: 'e2', name: 'Whipped Cream', price: 0.5 },
  ],
};

const CATEGORY_LABELS = {
  syrups: 'Syrups',
  spices: 'Spice & Seasonal',
  milks: 'Milk',
  extras: 'Extras',
};

export default function App() {
  const [view, setView] = useState('order');
  const [addons, setAddons] = useState(DEFAULT_ADDONS);
  const [loading, setLoading] = useState(true);
  const [temp, setTemp] = useState(null);
  const [base, setBase] = useState(null);
  const [selected, setSelected] = useState({ syrups: [], spices: [], milks: [], extras: [] });
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [askingName, setAskingName] = useState(false);

  // Realtime sync from Firebase
  useEffect(() => {
    const unsub = onSnapshot(
      MENU_DOC,
      (snap) => {
        if (snap.exists()) {
          setAddons({ ...DEFAULT_ADDONS, ...snap.data() });
        } else {
          // First load — seed the document with defaults
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
    const isShot = baseObj?.group === 'shots';
    const cats = isShot
      ? ['syrups', 'spices', 'extras']
      : ['syrups', 'spices', 'milks', 'extras'];
    const addonsList = [];
    cats.forEach((cat) => {
      selected[cat].forEach((id) => {
        const item = addons[cat]?.find((a) => a.id === id);
        if (item) addonsList.push(item.name);
      });
    });
    const orderText = `${tempLabel} ${baseObj?.name || ''}${addonsList.length ? ' · ' + addonsList.join(', ') : ''}`.trim();

    // Save to Firestore for the open-orders list
    try {
      await addDoc(collection(db, 'orders'), {
        customerName: trimmed,
        temp,
        drink: baseObj?.name || '',
        addons: addonsList,
        summary: orderText,
        status: 'open',
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('order save failed', e);
    }

    // Push notification
    notifyOrder(`${trimmed} — ${orderText}`, THEME.notifyTitle);

    setAskingName(false);
    setOrderPlaced(true);
    setTimeout(() => {
      setOrderPlaced(false);
      setTemp(null);
      setBase(null);
      setSelected({ syrups: [], spices: [], milks: [], extras: [] });
    }, 3500);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: COLORS.paper,
        fontFamily: THEME.sansFont,
        color: COLORS.espresso,
        backgroundImage: COLORS.starfield
          ? `radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 75% 65%, #fff, transparent), radial-gradient(1px 1px at 35% 80%, #fff8, transparent), radial-gradient(2px 2px at 85% 15%, #fff, transparent), radial-gradient(1px 1px at 60% 40%, #fff6, transparent), radial-gradient(1px 1px at 10% 70%, #fffa, transparent), radial-gradient(2px 2px at 90% 50%, #fff, transparent), radial-gradient(1px 1px at 50% 10%, #fff7, transparent), radial-gradient(1px 1px at 25% 55%, #fff8, transparent), radial-gradient(1px 1px at 70% 90%, #fff6, transparent), radial-gradient(circle at 50% 50%, ${COLORS.copper}10 0%, transparent 60%)`
          : `radial-gradient(circle at 20% 10%, ${COLORS.creamDark}55 0%, transparent 50%), radial-gradient(circle at 80% 90%, ${COLORS.copper}15 0%, transparent 40%)`,
        backgroundAttachment: 'fixed',
        backgroundSize: COLORS.starfield ? '100% 100%' : 'auto',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <link rel="stylesheet" href={FONTS_LINK} />

      {/* Header */}
      <header
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${COLORS.espresso}15`,
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

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '128px 0', color: COLORS.copperDark }}>
          <div style={{ fontFamily: THEME.monoFont, fontSize: 11, letterSpacing: '0.2em' }}>
            {THEME.brewingLabel}
          </div>
        </div>
      ) : view === 'order' ? (
        <OrderView {...{ temp, setTemp, base, setBase, addons, selected, setSelected, toggleSelected, baseObj, requestPlaceOrder, submitOrder, askingName, setAskingName, orderPlaced }} />
      ) : (
        <AdminView addons={addons} saveMenu={saveMenu} />
      )}
    </div>
  );
}

function OrderView({ temp, setTemp, base, setBase, addons, selected, setSelected, toggleSelected, baseObj, requestPlaceOrder, submitOrder, askingName, setAskingName, orderPlaced }) {
  if (orderPlaced) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 24px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, background: COLORS.ctaBg }}>
          <Check size={36} color={COLORS.ctaText} strokeWidth={2.5} />
        </div>
        <h2 style={{ fontFamily: THEME.serifFont, fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
          Your order is in.
        </h2>
        <p style={{ marginTop: 12, fontSize: 14, opacity: 0.7 }}>We'll have it ready in a few minutes.</p>
        <div style={{ marginTop: 24, padding: '8px 16px', borderRadius: 999, fontFamily: THEME.monoFont, fontSize: 11, letterSpacing: '0.2em', background: COLORS.selectedBg, color: COLORS.selectedText, border: `1px solid ${COLORS.copper}40` }}>
          {temp?.toUpperCase()} {baseObj?.name.toUpperCase()}
        </div>
      </div>
    );
  }

  const shotBases = ESPRESSO_BASES.filter((b) => b.group === 'shots' && b.temps.includes(temp));
  const milkBases = ESPRESSO_BASES.filter((b) => b.group === 'milk' && b.temps.includes(temp));

  // If user picks a temp that excludes their selected drink, clear it
  const handleTempChange = (newTemp) => {
    if (base) {
      const stillValid = ESPRESSO_BASES.find((b) => b.id === base)?.temps.includes(newTemp);
      if (!stillValid) setBase(null);
    }
    setTemp(newTemp);
  };

  // Clear milk selections if switching to a shot (since milk options will hide)
  const pickBase = (id) => {
    setBase(id);
    const newDrink = ESPRESSO_BASES.find((b) => b.id === id);
    if (newDrink?.group === 'shots') {
      setSelected((s) => ({ ...s, milks: [] }));
    }
  };

  return (
    <div style={{ padding: '24px 20px 128px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={sectionLabelStyle}>{THEME.heroPre}</div>
        <h1 style={{ fontFamily: THEME.serifFont, fontSize: 40, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.03em', margin: 0 }}>
          {THEME.heroLine[0]}<em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>{THEME.heroLine[1]}</em>{THEME.heroLine[2]}
        </h1>
      </div>

      <SectionLabel>01 · Hot or iced</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
        <TempButton active={temp === 'hot'} onClick={() => handleTempChange('hot')} icon={<Flame size={20} />} label="Hot" activeColor={COLORS.hotColor} />
        <TempButton active={temp === 'iced'} onClick={() => handleTempChange('iced')} icon={<Snowflake size={20} />} label="Iced" activeColor={COLORS.ice} />
      </div>

      {temp && (
        <>
          <SectionLabel>02 · Choose your drink</SectionLabel>
          {shotBases.length > 0 && (
            <>
              <SubLabel>Espresso shots</SubLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {shotBases.map((b) => (
                  <BaseButton key={b.id} item={b} active={base === b.id} onClick={() => pickBase(b.id)} />
                ))}
              </div>
            </>
          )}
          {milkBases.length > 0 && (
            <>
              <SubLabel>Espresso with milk</SubLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
                {milkBases.map((b) => (
                  <BaseButton key={b.id} item={b} active={base === b.id} onClick={() => pickBase(b.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {temp && base && (() => {
        const isShot = baseObj?.group === 'shots';
        const cats = isShot ? ['syrups', 'spices', 'extras'] : ['syrups', 'spices', 'milks', 'extras'];
        return cats.map((cat, i) => (
        addons[cat]?.length > 0 && (
          <div key={cat} style={{ marginBottom: 24 }}>
            <SectionLabel>{`0${i + 3} · ${CATEGORY_LABELS[cat]}`}</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {addons[cat].map((item) => {
                const isOn = selected[cat].includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSelected(cat, item.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      background: isOn ? COLORS.copper : 'transparent',
                      color: isOn ? COLORS.paper : COLORS.espresso,
                      border: `1px solid ${isOn ? COLORS.copper : COLORS.espresso + '30'}`,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ));
      })()}

      {temp && base && (
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
          orderSummary={`${temp ? temp[0].toUpperCase() + temp.slice(1) : ''} ${baseObj?.name || ''}`.trim()}
          onCancel={() => setAskingName(false)}
          onConfirm={submitOrder}
        />
      )}
    </div>
  );
}

function NameSheet({ orderSummary, onCancel, onConfirm }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={sectionLabelStyle}>— Last step</div>
            <h2 style={{ fontFamily: THEME.serifFont, fontSize: 28, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
              What's your <em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>name</em>?
            </h2>
            <p style={{ fontSize: 13, opacity: 0.7, marginTop: 8, marginBottom: 0 }}>
              {orderSummary}
            </p>
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
          autoFocus
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

function TempButton({ active, onClick, icon, label, activeColor }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '20px 0',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: active ? activeColor : COLORS.cream,
        color: active ? COLORS.paper : COLORS.espresso,
        border: `1px solid ${active ? activeColor : COLORS.espresso + '15'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {icon}
      <span style={{ fontFamily: THEME.serifFont, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>{label}</span>
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

  const placeholderName = { syrups: 'Cardamom', spices: 'Nutmeg', milks: 'Soy', extras: 'Honey' }[activeCat];

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
      <OpenOrders />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 20, padding: 4, borderRadius: 16, background: COLORS.cream }}>
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
