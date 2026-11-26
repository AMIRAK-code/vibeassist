pub mod scanner;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub app_version: String,
    pub app_data_dir: String,
    pub engine: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHttpRequest {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHttpResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiProbe {
    pub provider: String,
    pub label: String,
    pub base_url: String,
    pub reachable: bool,
    pub latency_ms: u128,
    pub models: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderProbeResult {
    pub url: String,
    pub status: u16,
    pub raw_headers: String,
}

fn validate_http_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }
    Ok(trimmed.to_string())
}

fn vault_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Could not create app data directory: {e}"))?;
    }
    Ok(dir.join("ai_vault.json"))
}

#[tauri::command]
fn desktop_system_info(app: tauri::AppHandle) -> Result<SystemInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "unavailable".to_string());

    Ok(SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_version: app.package_info().version.to_string(),
        app_data_dir: data_dir,
        engine: "Rust + Tauri v2".to_string(),
    })
}

#[tauri::command]
async fn desktop_ai_request(req: NativeHttpRequest) -> Result<NativeHttpResponse, String> {
    let url = validate_http_url(&req.url)?;
    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(45_000).clamp(1_000, 120_000));

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let method_str = req
        .method
        .as_deref()
        .unwrap_or("GET")
        .trim()
        .to_ascii_uppercase();
    let method = match method_str.as_str() {
        "POST" => reqwest::Method::POST,
        "GET" => reqwest::Method::GET,
        "HEAD" => reqwest::Method::HEAD,
        _ => return Err(format!("Unsupported HTTP method: {method_str}")),
    };

    let mut header_map = HeaderMap::new();
    if let Some(custom_headers) = req.headers {
        for (k, v) in custom_headers {
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(k.as_bytes()),
                HeaderValue::from_str(&v),
            ) {
                header_map.insert(name, val);
            }
        }
    }

    let mut builder = client.request(method, &url).headers(header_map);
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Network request failed: {e}"))?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let mut out_headers = HashMap::new();
    for (k, v) in response.headers() {
        if let Ok(s) = v.to_str() {
            out_headers.insert(k.as_str().to_string(), s.to_string());
        }
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed reading response body: {e}"))?;

    Ok(NativeHttpResponse {
        status,
        ok,
        body: text,
        headers: out_headers,
    })
}

async fn probe_single_local(
    provider: &'static str,
    label: &'static str,
    base_url: &'static str,
    probe_url: &'static str,
    is_ollama: bool,
) -> LocalAiProbe {
    let started = Instant::now();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(1_100))
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            return LocalAiProbe {
                provider: provider.to_string(),
                label: label.to_string(),
                base_url: base_url.to_string(),
                reachable: false,
                latency_ms: 0,
                models: Vec::new(),
            };
        }
    };

    let resp = match client.get(probe_url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => {
            return LocalAiProbe {
                provider: provider.to_string(),
                label: label.to_string(),
                base_url: base_url.to_string(),
                reachable: false,
                latency_ms: started.elapsed().as_millis(),
                models: Vec::new(),
            };
        }
    };

    let latency_ms = started.elapsed().as_millis();
    let json: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    let mut models = Vec::new();

    if is_ollama {
        if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
            for item in arr.iter().take(25) {
                if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                    models.push(name.to_string());
                }
            }
        }
    } else if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        for item in arr.iter().take(25) {
            if let Some(id) = item.get("id").and_then(|n| n.as_str()) {
                models.push(id.to_string());
            }
        }
    }

    LocalAiProbe {
        provider: provider.to_string(),
        label: label.to_string(),
        base_url: base_url.to_string(),
        reachable: true,
        latency_ms,
        models,
    }
}

#[tauri::command]
async fn desktop_probe_local_ai() -> Result<Vec<LocalAiProbe>, String> {
    let t1 = tauri::async_runtime::spawn(probe_single_local(
        "ollama",
        "Ollama (Local)",
        "http://127.0.0.1:11434/v1",
        "http://127.0.0.1:11434/api/tags",
        true,
    ));
    let t2 = tauri::async_runtime::spawn(probe_single_local(
        "lmstudio",
        "LM Studio (Local)",
        "http://127.0.0.1:1234/v1",
        "http://127.0.0.1:1234/v1/models",
        false,
    ));
    let t3 = tauri::async_runtime::spawn(probe_single_local(
        "custom_local",
        "vLLM / LocalAI (Port 8000)",
        "http://127.0.0.1:8000/v1",
        "http://127.0.0.1:8000/v1/models",
        false,
    ));

    let mut out = Vec::with_capacity(3);
    for handle in [t1, t2, t3] {
        if let Ok(res) = handle.await {
            out.push(res);
        }
    }
    Ok(out)
}

#[tauri::command]
async fn desktop_fetch_headers(url: String) -> Result<HeaderProbeResult, String> {
    let clean_url = validate_http_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut resp = client
        .head(&clean_url)
        .send()
        .await
        .map_err(|e| format!("Could not reach {clean_url}: {e}"))?;

    if resp.status().as_u16() == 405 {
        resp = client
            .get(&clean_url)
            .send()
            .await
            .map_err(|e| format!("Could not reach {clean_url}: {e}"))?;
    }

    let status = resp.status().as_u16();
    let reason = resp.status().canonical_reason().unwrap_or("");
    let mut lines = vec![format!("HTTP/1.1 {status} {reason}")];
    for (name, val) in resp.headers() {
        if let Ok(v) = val.to_str() {
            lines.push(format!("{}: {}", name.as_str(), v));
        }
    }

    Ok(HeaderProbeResult {
        url: clean_url,
        status,
        raw_headers: lines.join("\n"),
    })
}

#[tauri::command]
fn desktop_scan_directory(path: String) -> Result<scanner::DirScanReport, String> {
    let root = PathBuf::from(path.trim());
    scanner::scan_workspace_dir(&root, 800)
}

#[tauri::command]
fn desktop_vault_save(app: tauri::AppHandle, payload: String) -> Result<String, String> {
    let file = vault_file_path(&app)?;
    fs::write(&file, payload.as_bytes()).map_err(|e| format!("Could not save native vault: {e}"))?;
    Ok(file.display().to_string())
}

#[tauri::command]
fn desktop_vault_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = vault_file_path(&app)?;
    if !file.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&file).map_err(|e| format!("Could not read native vault: {e}"))?;
    Ok(Some(content))
}

#[tauri::command]
fn desktop_set_always_on_top(window: tauri::Window, enabled: bool) -> Result<bool, String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| format!("Could not toggle always-on-top: {e}"))?;
    Ok(enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_system_info,
            desktop_ai_request,
            desktop_probe_local_ai,
            desktop_fetch_headers,
            desktop_scan_directory,
            desktop_vault_save,
            desktop_vault_load,
            desktop_set_always_on_top,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VibeAssist desktop application");
}
