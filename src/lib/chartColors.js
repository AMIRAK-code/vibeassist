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
