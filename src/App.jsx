import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Coffee, Settings, ShoppingBag, Check, ChevronLeft, Snowflake, Flame, Bell, BellOff } from 'lucide-react';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { MENU_DOC } from './firebase';
import { pushSupported, checkSubscribed, subscribeToPush, unsubscribeFromPush, notifyOrder } from './push';

const COLORS = {
  cream: '#f4ede0',
  creamDark: '#ebe2d2',
  espresso: '#2a1810',
  espressoLight: '#4a2e1f',
  copper: '#b8743d',
  copperDark: '#8f5526',
  paper: '#fbf7ee',
  ice: '#5a8ea8',
};

const FONTS_LINK = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';

const ESPRESSO_BASES = [
  { id: 'single', name: 'Single Shot', desc: 'One pure shot of espresso', price: 3.0, group: 'shots' },
  { id: 'double', name: 'Doppio', desc: 'A double shot, twice the depth', price: 4.0, group: 'shots' },
  { id: 'ristretto', name: 'Ristretto', desc: 'Shorter pull, concentrated body', price: 3.5, group: 'shots' },
  { id: 'lungo', name: 'Lungo', desc: 'Long pull, lighter and lengthier', price: 3.5, group: 'shots' },
  { id: 'americano', name: 'Americano', desc: 'Espresso with hot water', price: 4.0, group: 'shots' },
  { id: 'macchiato', name: 'Macchiato', desc: 'Espresso marked with a dollop of foam', price: 4.5, group: 'milk' },
  { id: 'cortado', name: 'Cortado', desc: 'Espresso cut with warm steamed milk', price: 4.5, group: 'milk' },
  { id: 'cappuccino', name: 'Cappuccino', desc: 'Equal parts espresso, milk, and foam', price: 5.0, group: 'milk' },
  { id: 'flatwhite', name: 'Flat White', desc: 'Velvety microfoam over a double shot', price: 5.0, group: 'milk' },
  { id: 'latte', name: 'Caffè Latte', desc: 'Smooth espresso with steamed milk', price: 5.5, group: 'milk' },
  { id: 'mocha', name: 'Mocha', desc: 'Espresso, chocolate, and milk', price: 6.0, group: 'milk' },
];

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
  const addonTotal = ['syrups', 'spices', 'milks', 'extras'].reduce((sum, cat) => {
    return sum + selected[cat].reduce((s, id) => {
      const item = addons[cat]?.find((a) => a.id === id);
      return s + (item?.price || 0);
    }, 0);
  }, 0);
  const total = (baseObj?.price || 0) + addonTotal;

  const placeOrder = () => {
    // Build a readable summary for the notification
    const tempLabel = temp ? temp.charAt(0).toUpperCase() + temp.slice(1) : '';
    const parts = [];
    ['syrups', 'spices', 'milks', 'extras'].forEach((cat) => {
      selected[cat].forEach((id) => {
        const item = addons[cat]?.find((a) => a.id === id);
        if (item) parts.push(item.name);
      });
    });
    const orderText = `${tempLabel} ${baseObj?.name || ''}${parts.length ? ' · ' + parts.join(', ') : ''}`.trim();
    notifyOrder(orderText, total);

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
        fontFamily: "'DM Sans', sans-serif",
        color: COLORS.espresso,
        backgroundImage: `radial-gradient(circle at 20% 10%, ${COLORS.creamDark}55 0%, transparent 50%), radial-gradient(circle at 80% 90%, ${COLORS.copper}15 0%, transparent 40%)`,
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
              background: COLORS.espresso,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Coffee size={16} color={COLORS.cream} />
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, lineHeight: 1, letterSpacing: '-0.02em' }}>
              Caffè
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: COLORS.copperDark, textTransform: 'uppercase', marginTop: 2 }}>
              Est. Today
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
            background: view === 'admin' ? COLORS.espresso : 'transparent',
            color: view === 'admin' ? COLORS.cream : COLORS.espresso,
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
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em' }}>
            BREWING...
          </div>
        </div>
      ) : view === 'order' ? (
        <OrderView {...{ temp, setTemp, base, setBase, addons, selected, toggleSelected, total, baseObj, placeOrder, orderPlaced }} />
      ) : (
        <AdminView addons={addons} saveMenu={saveMenu} />
      )}
    </div>
  );
}

function OrderView({ temp, setTemp, base, setBase, addons, selected, toggleSelected, total, baseObj, placeOrder, orderPlaced }) {
  if (orderPlaced) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '96px 24px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, background: COLORS.espresso }}>
          <Check size={36} color={COLORS.cream} strokeWidth={2.5} />
        </div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
          Your order is in.
        </h2>
        <p style={{ marginTop: 12, fontSize: 14, opacity: 0.7 }}>We'll have it ready in a few minutes.</p>
        <div style={{ marginTop: 24, padding: '8px 16px', borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', background: COLORS.espresso, color: COLORS.cream }}>
          ${total.toFixed(2)} · {temp?.toUpperCase()} {baseObj?.name.toUpperCase()}
        </div>
      </div>
    );
  }

  const shotBases = ESPRESSO_BASES.filter((b) => b.group === 'shots');
  const milkBases = ESPRESSO_BASES.filter((b) => b.group === 'milk');

  return (
    <div style={{ padding: '24px 20px 128px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={sectionLabelStyle}>— The Menu</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.03em', margin: 0 }}>
          Build your <em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>perfect</em> shot.
        </h1>
      </div>

      <SectionLabel>01 · Hot or iced</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
        <TempButton active={temp === 'hot'} onClick={() => setTemp('hot')} icon={<Flame size={20} />} label="Hot" activeColor={COLORS.copperDark} />
        <TempButton active={temp === 'iced'} onClick={() => setTemp('iced')} icon={<Snowflake size={20} />} label="Iced" activeColor={COLORS.ice} />
      </div>

      {temp && (
        <>
          <SectionLabel>02 · Choose your drink</SectionLabel>
          <SubLabel>Espresso shots</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {shotBases.map((b) => (
              <BaseButton key={b.id} item={b} active={base === b.id} onClick={() => setBase(b.id)} />
            ))}
          </div>
          <SubLabel>Espresso with milk</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
            {milkBases.map((b) => (
              <BaseButton key={b.id} item={b} active={base === b.id} onClick={() => setBase(b.id)} />
            ))}
          </div>
        </>
      )}

      {temp && base && ['syrups', 'spices', 'milks', 'extras'].map((cat, i) => (
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
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.7 }}>+${item.price.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ))}

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
            onClick={placeOrder}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: COLORS.espresso,
              color: COLORS.cream,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingBag size={16} />
              <span style={{ fontWeight: 500, fontSize: 14 }}>Place order</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 14 }}>${total.toFixed(2)}</div>
          </button>
        </div>
      )}
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
      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>{label}</span>
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
        background: active ? COLORS.espresso : COLORS.cream,
        color: active ? COLORS.cream : COLORS.espresso,
        border: `1px solid ${active ? COLORS.espresso : COLORS.espresso + '15'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>{item.name}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{item.desc}</div>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 500 }}>${item.price.toFixed(2)}</div>
    </button>
  );
}

function SubLabel({ children }) {
  return (
    <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 13, color: COLORS.copperDark, marginBottom: 8, marginTop: 2 }}>
      {children}
    </div>
  );
}

const sectionLabelStyle = {
  fontFamily: "'JetBrains Mono', monospace",
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
        Notifications aren't supported on this browser. On iPhone, add Caffè to your home screen and open it from there.
      </div>
    );
  }

  return (
    <div style={{
      padding: 14,
      borderRadius: 16,
      marginBottom: 16,
      background: enabled ? COLORS.espresso : COLORS.cream,
      color: enabled ? COLORS.cream : COLORS.espresso,
      border: `1px solid ${enabled ? COLORS.espresso : COLORS.espresso + '10'}`,
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
            {enabled ? <Bell size={16} color={COLORS.paper} /> : <BellOff size={16} color={COLORS.espressoLight} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 500 }}>
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
            fontWeight: 500,
            background: enabled ? COLORS.cream : COLORS.espresso,
            color: enabled ? COLORS.espresso : COLORS.cream,
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
          background: enabled ? COLORS.espressoLight : '#f8d7d7',
          color: enabled ? COLORS.cream : '#8b2c2c',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function AdminView({ addons, saveMenu }) {
  const [activeCat, setActiveCat] = useState('syrups');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const addItem = () => {
    const name = newName.trim();
    const price = parseFloat(newPrice);
    if (!name || isNaN(price) || price < 0) return;
    const next = {
      ...addons,
      [activeCat]: [...(addons[activeCat] || []), { id: `${activeCat}${Date.now()}`, name, price }],
    };
    saveMenu(next);
    setNewName('');
    setNewPrice('');
  };

  const removeItem = (id) => {
    saveMenu({ ...addons, [activeCat]: addons[activeCat].filter((x) => x.id !== id) });
  };

  const placeholderName = { syrups: 'Cardamom', spices: 'Nutmeg', milks: 'Soy', extras: 'Honey' }[activeCat];

  return (
    <div style={{ padding: '24px 20px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={sectionLabelStyle}>— Owner panel</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', margin: 0 }}>
          Curate the <em style={{ fontStyle: 'italic', color: COLORS.copperDark }}>menu</em>.
        </h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>Changes save instantly and appear for everyone.</p>
      </div>

      <NotifToggle />

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
              background: activeCat === cat ? COLORS.espresso : 'transparent',
              color: activeCat === cat ? COLORS.cream : COLORS.espresso,
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Name (e.g. ${placeholderName})`}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 12, fontSize: 14, outline: 'none', minWidth: 0, background: COLORS.paper, border: `1px solid ${COLORS.espresso}20`, fontFamily: "'DM Sans', sans-serif" }}
          />
          <input
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="0.75"
            type="number"
            step="0.25"
            style={{ width: 80, padding: '10px 12px', borderRadius: 12, fontSize: 14, outline: 'none', background: COLORS.paper, border: `1px solid ${COLORS.espresso}20`, fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
        <button
          onClick={addItem}
          disabled={!newName.trim() || !newPrice}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 500,
            background: COLORS.espresso,
            color: COLORS.cream,
            opacity: !newName.trim() || !newPrice ? 0.4 : 1,
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
              <div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.copperDark, marginTop: 2 }}>+${item.price.toFixed(2)}</div>
              </div>
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
