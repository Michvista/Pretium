import { computeTrend } from '../src/services/trend';

describe('computeTrend', () => {
  it('detects a falling trend with a high buy score', () => {
    const t = computeTrend([
      { date: '2026-08-01', price: 120 },
      { date: '2026-08-08', price: 110 },
      { date: '2026-08-15', price: 100 },
    ]);
    expect(t.direction).toBe('falling');
    expect(t.score).toBeGreaterThan(60);
    expect(t.recommendation).toContain('buy');
  });

  it('detects a rising trend with a low buy score', () => {
    const t = computeTrend([
      { date: '2026-08-01', price: 100 },
      { date: '2026-08-08', price: 115 },
      { date: '2026-08-15', price: 130 },
    ]);
    expect(t.direction).toBe('rising');
    expect(t.score).toBeLessThan(50);
  });

  it('detects a stable trend', () => {
    const t = computeTrend([
      { date: '2026-08-01', price: 110 },
      { date: '2026-08-08', price: 112 },
      { date: '2026-08-15', price: 109 },
    ]);
    expect(t.direction).toBe('stable');
  });

  it('carries the sparkline history through', () => {
    const t = computeTrend([
      { date: 'a', price: 10 },
      { date: 'b', price: 9 },
    ]);
    expect(t.history).toHaveLength(2);
    expect(t.history[1].price).toBe(9);
  });
});