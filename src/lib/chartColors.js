// One colour per thing, used the same way in every chart: anything paid for with ads is
// orange, profit is green, revenue and organic installs are cobalt. Checked with the
// dataviz palette validator against the card surface (#FFFDFA); the green is under 3:1,
// so charts using it come with a table of the exact numbers.
export const SERIES_COLORS = {
  revenue: '#2448FF',
  organicDownloads: '#2448FF',
  profit: '#1BAF7A',
  adSpend: '#EB6834',
  paidDownloads: '#EB6834',
};

export const CHART_CHROME = { grid: '#ECE7DE', axis: '#79746C', baseline: '#E2DCD0', surface: '#FFFDFA' };

// The Simple (clay) preset keeps its original chart look: light blue revenue over deep blue
// profit, ink ad spend, yellow organic and blue paid installs, on the bone surface (#FAF9F6).
// Revenue and profit differ mainly in lightness, so these charts keep their number tables too.
export const PALETTES = {
  advanced: { series: SERIES_COLORS, chrome: CHART_CHROME, cursor: 'rgba(36,72,255,0.06)' },
  simple: {
    series: { revenue: '#6FA3EA', profit: '#1D58C4', adSpend: '#111111', organicDownloads: '#F2B705', paidDownloads: '#2B75E8' },
    chrome: { grid: '#E7E4DD', axis: '#6E6E7E', baseline: '#DCD8CF', surface: '#FAF9F6' },
    cursor: 'rgba(43,117,232,0.08)',
  },
};
