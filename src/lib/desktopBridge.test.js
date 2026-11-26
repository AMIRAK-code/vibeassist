import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopFetch, getDesktopSystemInfo, isDesktopApp } from './desktopBridge';

describe('desktopBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') {
      delete window.__TAURI_INTERNALS__;
    }
  });

  it('reports false for isDesktopApp and null system info in web environment', async () => {
    expect(isDesktopApp()).toBe(false);
    expect(await getDesktopSystemInfo()).toBeNull();
  });

  it('falls back to standard fetch when not running inside Tauri', async () => {
    const mockRes = { ok: true, status: 200, json: async () => ({ ok: true }) };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes);
    const out = await desktopFetch('https://example.com/v1/models', { method: 'GET' });
    expect(spy).toHaveBeenCalledWith('https://example.com/v1/models', { method: 'GET' });
    expect(out.status).toBe(200);
  });
});
