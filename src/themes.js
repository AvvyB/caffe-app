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
    accent: '#b8743d', // copper
    danger: '#c25555',
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

  colors: {
    // Reads as: deep space + gold lightsaber accents + crimson energy
    cream: '#1a1a24',          // panel surface (dark)
    creamDark: '#13131c',      // slightly darker panel
    espresso: '#0a0a12',       // primary "ink" — near-black space
    espressoLight: '#2a2a3a',  // muted dark grey-blue
    copper: '#d4af37',         // imperial gold — selected chip
    copperDark: '#a8862a',     // darker gold for accents
    paper: '#05050a',          // background — deep space
    ice: '#5cb7ff',            // hyperspace blue (iced button)
    accent: '#d4af37',
    danger: '#ff4d4d',         // crimson saber
  },

  fontsLink:
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;500;600&family=Share+Tech+Mono&display=swap',
  serifFont: "'Cinzel', serif",
  sansFont: "'Inter', sans-serif",
  monoFont: "'Share Tech Mono', monospace",

  brandName: 'Cantina',
  tagline: 'Mos Espa · Tatooine',
  heroPre: '— The Holomenu',
  heroLine: ['Brew your ', 'destiny', '.'],
  brewingLabel: 'CALIBRATING...',
  ownerHeroPre: '— Imperial Council',
  ownerHeroLine: ['Curate the ', 'archives', '.'],
  notifyTitle: 'New order — A New Hope ⚔️',

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
      desc: 'Cold steamed oat milk, blueberry, almond — caffeine-free',
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
