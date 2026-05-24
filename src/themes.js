// Theme definitions. Add more here, then point THEME_NAME at it in config.js.

const DEFAULT_THEME = {
  id: 'default',

  // Colors
  colors: {
    cream: '#f4ede0',
    creamDark: '#ebe2d2',
    espresso: '#2a1810',
    espressoLight: '#4a2e1f',
    copper: '#b8743d',
    copperDark: '#8f5526',
    paper: '#fbf7ee',
    ice: '#5a8ea8',
    accent: '#b8743d',
    danger: '#c25555',
    // Primary CTA button (Place Order, Confirm, Add, etc.)
    ctaBg: '#2a1810',
    ctaText: '#f4ede0',
    hotColor: '#8f5526',
    // Selected state (drink picker, open-order cards)
    selectedBg: '#2a1810',  // espresso
    selectedText: '#f4ede0', // cream
    starfield: false,
  },

  // Fonts
  fontsLink:
    'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
  serifFont: "'Fraunces', serif",
  sansFont: "'DM Sans', sans-serif",
  monoFont: "'JetBrains Mono', monospace",

  // Copy
  brandName: 'Caffè',
  tagline: 'Est. Today',
  heroPre: '— The Menu',
  heroLine: ['Build your ', 'perfect', ' shot.'],
  brewingLabel: 'BREWING...',
  ownerHeroPre: '— Owner panel',
  ownerHeroLine: ['Curate the ', 'menu', '.'],
  notifyTitle: 'New order ☕',

  // Per-theme drinks added to the base list. Set [] for none.
  // Same shape as ESPRESSO_BASES: { id, name, desc, group, temps }
  exclusiveDrinks: [],
};

const STAR_WARS_THEME = {
  id: 'starwars',

  // Dark theme: surfaces are dark, "espresso" semantically means
  // the high-contrast text color (so it's now near-white, not black).
  colors: {
    paper: '#06060d',          // page background — deep space
    cream: '#16161f',          // panel surface
    creamDark: '#1f1f2c',      // raised panel / hover
    espresso: '#f0e6c8',       // PRIMARY TEXT — warm parchment cream
    espressoLight: '#c9bfa6',  // secondary text
    copper: '#ffb700',         // lightsaber gold — selected chips
    copperDark: '#ffd95a',     // bright gold accents (italic emphasis)
    ice: '#3ea6ff',            // lightsaber blue — Jedi (iced)
    accent: '#ffb700',
    danger: '#ff2e2e',         // sith red
    sithRed: '#ff2e2e',        // for the hot button
    starfield: true,           // signal to App.jsx to render starfield
    // Primary CTA — gold so it pops against deep space
    ctaBg: '#ffb700',
    ctaText: '#06060d',
    hotColor: '#ff2e2e', // sith red lightsaber
    // Selected drink — gold-bordered dark panel for stark contrast
    selectedBg: '#2a2418',     // dark olive-brown (raised gold-tinted panel)
    selectedText: '#ffb700',   // bright gold
  },

  fontsLink:
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Russo+One&family=Inter:wght@400;500;600&family=Share+Tech+Mono&display=swap',
  serifFont: "'Orbitron', sans-serif",   // distinct sci-fi display
  sansFont: "'Inter', sans-serif",
  monoFont: "'Share Tech Mono', monospace",

  brandName: 'CANTINA',
  tagline: 'A long time ago...',
  heroPre: '— Episode IV · The Holomenu',
  heroLine: ['These are the brews you ', 'are', ' looking for.'],
  brewingLabel: 'JUMPING TO LIGHTSPEED...',
  ownerHeroPre: '— Imperial Archives',
  ownerHeroLine: ['Curate the ', 'galaxy', '.'],
  notifyTitle: 'A new order has awakened ⚔️',

  exclusiveDrinks: [
    {
      id: 'darkside',
      name: 'The Dark Side',
      desc: 'Triple ristretto, dark chocolate, black sea salt, smoke',
      group: 'milk',
      temps: ['hot', 'iced'],
    },
    {
      id: 'jedi',
      name: 'Jedi Mind Trick',
      desc: 'Honey-vanilla latte with cardamom and orange peel',
      group: 'milk',
      temps: ['hot', 'iced'],
    },
    {
      id: 'bluemilk',
      name: 'Blue Milk',
      desc: 'Cold oat milk, blueberry, almond — caffeine-free',
      group: 'milk',
      temps: ['iced'],
    },
    {
      id: 'wookiee',
      name: 'The Wookiee',
      desc: 'Quad-shot mocha with hazelnut and toasted marshmallow',
      group: 'milk',
      temps: ['hot'],
    },
    {
      id: 'tatooine',
      name: 'Twin Suns of Tatooine',
      desc: 'Iced double shot, salted caramel, orange zest',
      group: 'milk',
      temps: ['iced'],
    },
  ],
};

const THEMES = {
  default: DEFAULT_THEME,
  starwars: STAR_WARS_THEME,
};

export function getTheme(name) {
  return THEMES[name] || DEFAULT_THEME;
}
