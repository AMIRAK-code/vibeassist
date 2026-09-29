import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleMetrics, selectPeriod, summarizeMetrics } from '../src/data/metrics.js';

test('weekly cards reconcile to all seven daily rows', () => {
  assert.deepEqual(summarizeMetrics(selectPeriod(sampleMetrics, 7)), { revenue: 19550, downloads: 30406 });
});
test('changing the period changes both cards and chart rows', () => {
  const rows = selectPeriod(sampleMetrics, 3);
  assert.deepEqual(rows.map(row => row.day), ['Fri', 'Sat', 'Sun']);
  assert.deepEqual(summarizeMetrics(rows), { revenue: 7770, downloads: 12900 });
  assert.equal(sampleMetrics.length, 7);
});
test('empty or invalid periods do not create misleading totals', () => {
  assert.deepEqual(summarizeMetrics([]), { revenue: 0, downloads: 0 });
  for (const days of [0, -1, NaN, 1.5]) assert.deepEqual(selectPeriod(sampleMetrics, days), []);
});
