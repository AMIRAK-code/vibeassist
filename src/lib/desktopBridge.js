// Bridge to the native Rust + Tauri v2 backend when running as a desktop app,
// with safe no-op / browser fallbacks when running in a standard web browser.

import { invoke } from '@tauri-apps/api/core';

export function isDesktopApp() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export async function invokeDesktop(command, args = {}) {
  if (!isDesktopApp()) {
    throw new Error('Native Rust command is only available inside the VibeAssist Desktop app.');
  }
  return invoke(command, args);
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

// Routes HTTP calls through Rust `reqwest` on desktop (bypassing WebView CORS for Ollama,
// LM Studio, vLLM, and direct cloud AI endpoints) while using standard `fetch` on web.
export async function desktopFetch(url, init = {}) {
  if (!isDesktopApp()) {
    return fetch(url, init);
  }

  if (init.signal?.aborted) {
    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  const res = await invokeDesktop('desktop_ai_request', {
    req: {
      url: String(url),
      method: init.method ? String(init.method).toUpperCase() : 'GET',
      headers: normalizeHeaders(init.headers),
      body: typeof init.body === 'string' ? init.body : null,
      timeoutMs: 45000,
    },
  });

  return {
    ok: Boolean(res.ok),
    status: Number(res.status),
    headers: new Headers(res.headers ?? {}),
    text: async () => String(res.body ?? ''),
    json: async () => JSON.parse(res.body ?? 'null'),
  };
}

export async function getDesktopSystemInfo() {
  if (!isDesktopApp()) return null;
  try {
    return await invokeDesktop('desktop_system_info');
  } catch {
    return null;
  }
}

export async function probeLocalAiServers() {
  return invokeDesktop('desktop_probe_local_ai');
}

export async function fetchLiveUrlHeaders(url) {
  return invokeDesktop('desktop_fetch_headers', { url: String(url ?? '').trim() });
}

export async function scanLocalDirectory(path) {
  return invokeDesktop('desktop_scan_directory', { path: String(path ?? '').trim() });
}

export async function saveDesktopVault(data) {
  if (!isDesktopApp()) return null;
  try {
    return await invokeDesktop('desktop_vault_save', { payload: JSON.stringify(data, null, 2) });
  } catch {
    return null;
  }
}

export async function loadDesktopVault() {
  if (!isDesktopApp()) return null;
  try {
    const raw = await invokeDesktop('desktop_vault_load');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setDesktopAlwaysOnTop(enabled) {
  return invokeDesktop('desktop_set_always_on_top', { enabled: Boolean(enabled) });
}
