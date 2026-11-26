use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Instant;

const MAX_FILE_BYTES: u64 = 512 * 1024;
const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "dist-ssr",
    ".wrangler",
    ".next",
    "build",
    "coverage",
];
const BINARY_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "ico", "icns", "woff", "woff2", "ttf", "otf", "exe",
    "dll", "so", "dylib", "zip", "tar", "gz", "pdf", "mp4", "webm", "wasm", "lockb",
];

struct SecretRule {
    id: &'static str,
    title: &'static str,
    severity: &'static str,
    remediation: &'static str,
    regex: Regex,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretFinding {
    pub id: String,
    pub rule_id: String,
    pub title: String,
    pub severity: String,
    pub file: String,
    pub line: usize,
    pub preview: String,
    pub remediation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirScanReport {
    pub root: String,
    pub scanned_files: usize,
    pub scanned_lines: usize,
    pub elapsed_ms: u128,
    pub findings: Vec<SecretFinding>,
}

fn compiled_rules() -> &'static Vec<SecretRule> {
    static RULES: OnceLock<Vec<SecretRule>> = OnceLock::new();
    RULES.get_or_init(|| {
        let specs: &[(&str, &str, &str, &str, &str)] = &[
            (
                "anthropic_key",
                "Anthropic Claude API Key",
                "critical",
                r"\bsk-ant-[A-Za-z0-9_-]{20,}\b",
                "Revoke exposed Anthropic key and load from environment variables.",
            ),
            (
                "openai_key",
                "OpenAI API Secret Key",
                "critical",
                r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b",
                "Move OpenAI secret keys into server secrets or OS vault; never commit to git.",
            ),
            (
                "gemini_key",
                "Google Gemini / API Key",
                "high",
                r"\bAIza[0-9A-Za-z_-]{35}\b",
                "Restrict key referrers in Google Cloud Console or move server-side.",
            ),
            (
                "stripe_secret",
                "Stripe Live Secret / Restricted Key",
                "critical",
                r"\b(?:sk_live_|rk_live_)[0-9A-Za-z]{16,}\b",
                "Roll compromised Stripe live keys immediately in the Stripe Dashboard.",
            ),
            (
                "github_pat",
                "GitHub Personal Access Token",
                "critical",
                r"\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,})\b",
                "Revoke exposed GitHub token under Developer Settings -> Tokens.",
            ),
            (
                "aws_access_key",
                "AWS Access Key ID",
                "critical",
                r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b",
                "Rotate IAM credentials and switch to short-lived OIDC roles.",
            ),
            (
                "supabase_service_key",
                "Supabase Service Role / Secret Key",
                "critical",
                r"\bsb_secret_[A-Za-z0-9_-]{20,}\b",
                "Service-role keys bypass RLS; never store them in client code or repositories.",
            ),
            (
                "private_key_block",
                "PEM Private Key Block",
                "critical",
                r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
                "Remove private keys from source control and rotate certificates.",
            ),
        ];

        specs
            .iter()
            .filter_map(|(id, title, severity, pat, remediation)| {
                Regex::new(pat).ok().map(|regex| SecretRule {
                    id,
                    title,
                    severity,
                    remediation,
                    regex,
                })
            })
            .collect()
    })
}

pub fn mask_secret(token: &str) -> String {
    let trimmed = token.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 10 {
        let prefix: String = chars.iter().take(4).collect();
        return format!("{prefix}••••••••");
    }
    let prefix: String = chars.iter().take(6).collect();
    let suffix: String = chars.iter().skip(chars.len() - 3).collect();
    format!("{prefix}••••••••{suffix}")
}

fn should_skip_file(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_ascii_lowercase();
        if BINARY_EXTS.contains(&lower.as_str()) {
            return true;
        }
    }
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name == "package-lock.json" || name == "pnpm-lock.yaml" || name == "Cargo.lock" {
            return true;
        }
    }
    false
}

fn scan_text(
    content: &str,
    rel_file: &str,
    findings: &mut Vec<SecretFinding>,
    max_findings: usize,
) -> usize {
    let rules = compiled_rules();
    let mut lines = 0usize;
    for (idx, line) in content.lines().enumerate() {
        lines += 1;
        if line.len() > 2000 || findings.len() >= max_findings {
            continue;
        }
        for rule in rules {
            if let Some(mat) = rule.regex.find(line) {
                if rule.id == "openai_key" && mat.as_str().starts_with("sk-ant-") {
                    continue;
                }
                findings.push(SecretFinding {
                    id: format!("{}:{}:{}", rel_file, idx + 1, rule.id),
                    rule_id: rule.id.to_string(),
                    title: rule.title.to_string(),
                    severity: rule.severity.to_string(),
                    file: rel_file.to_string(),
                    line: idx + 1,
                    preview: mask_secret(mat.as_str()),
                    remediation: rule.remediation.to_string(),
                });
                if findings.len() >= max_findings {
                    break;
                }
            }
        }
    }
    lines
}

fn walk_dir(
    root: &Path,
    current: &Path,
    max_files: usize,
    scanned_files: &mut usize,
    scanned_lines: &mut usize,
    findings: &mut Vec<SecretFinding>,
) {
    if *scanned_files >= max_files || findings.len() >= 200 {
        return;
    }
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if *scanned_files >= max_files || findings.len() >= 200 {
            break;
        }
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if SKIP_DIRS.contains(&name_str.as_ref()) {
                continue;
            }
            walk_dir(root, &path, max_files, scanned_files, scanned_lines, findings);
        } else if file_type.is_file() {
            if should_skip_file(&path) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                *scanned_files += 1;
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                *scanned_lines += scan_text(&content, &rel, findings, 200);
            }
        }
    }
}

pub fn scan_workspace_dir(root: &Path, max_files: usize) -> Result<DirScanReport, String> {
    if !root.exists() {
        return Err(format!("Path does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", root.display()));
    }

    let started = Instant::now();
    let mut scanned_files = 0usize;
    let mut scanned_lines = 0usize;
    let mut findings = Vec::new();

    walk_dir(
        root,
        root,
        max_files,
        &mut scanned_files,
        &mut scanned_lines,
        &mut findings,
    );

    Ok(DirScanReport {
        root: root.display().to_string(),
        scanned_files,
        scanned_lines,
        elapsed_ms: started.elapsed().as_millis(),
        findings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_tokens_without_exposing_middle() {
        let tok = ["sk", "live", "51AbCdEfGhIjKlMnOpQrStUvWx"].join("_");
        let masked = mask_secret(&tok);
        assert!(masked.starts_with("sk_liv"));
        assert!(masked.ends_with("vWx"));
        assert!(!masked.contains("AbCdEfGhIjKl"));
    }

    #[test]
    fn detects_synthetic_leaks_in_text() {
        let stripe_tok = ["sk", "live", "51AbCdEfGhIjKlMnOpQrStUvWx"].join("_");
        let openai_tok = ["sk", "proj", "1234567890abcdefghijklmnop"].join("-");
        let sample = format!("SAFE=1\nSTRIPE={stripe_tok}\nOPENAI={openai_tok}\n");
        let mut findings = Vec::new();
        let lines = scan_text(&sample, ".env.test", &mut findings, 50);
        assert_eq!(lines, 3);
        assert_eq!(findings.len(), 2);
        assert_eq!(findings[0].rule_id, "stripe_secret");
        assert_eq!(findings[1].rule_id, "openai_key");
    }
}
