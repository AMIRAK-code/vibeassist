import React, { useMemo, useState } from 'react';
import { Apple, Copy, FileDown, Play } from 'lucide-react';
import { useToast } from './ui/toast-context';
import { download } from '../lib/download';

const APPLE_APIS = [
  { key: 'NSPrivacyAccessedAPICategoryUserDefaults', reason: 'CA92.1', label: 'UserDefaults (CA92.1 — app preferences & settings)' },
  { key: 'NSPrivacyAccessedAPICategoryFileTimestamp', reason: 'C617.1', label: 'File Timestamps (C617.1 — cache & temp file timestamps)' },
  { key: 'NSPrivacyAccessedAPICategorySystemBootTime', reason: '35F9.1', label: 'System Boot Time (35F9.1 — monotonic timers & uptime)' },
  { key: 'NSPrivacyAccessedAPICategoryDiskSpace', reason: 'E174.1', label: 'Disk Space (E174.1 — check available storage before downloads)' },
];

const DATA_TYPES = [
  { key: 'NSPrivacyCollectedDataTypeEmailAddress', playName: 'Personal info · Email address', label: 'Email address', purpose: 'NSPrivacyCollectedDataTypePurposeAppFunctionality', linked: true },
  { key: 'NSPrivacyCollectedDataTypeName', playName: 'Personal info · Name', label: 'Name', purpose: 'NSPrivacyCollectedDataTypePurposeAppFunctionality', linked: true },
  { key: 'NSPrivacyCollectedDataTypeUserID', playName: 'Personal info · User IDs', label: 'Account / User ID', purpose: 'NSPrivacyCollectedDataTypePurposeAppFunctionality', linked: true },
  { key: 'NSPrivacyCollectedDataTypePurchaseHistory', playName: 'Financial info · Purchase history', label: 'Purchase history', purpose: 'NSPrivacyCollectedDataTypePurposeAppFunctionality', linked: true },
  { key: 'NSPrivacyCollectedDataTypeProductInteraction', playName: 'App activity · App interactions', label: 'Product interaction analytics', purpose: 'NSPrivacyCollectedDataTypePurposeAnalytics', linked: false },
  { key: 'NSPrivacyCollectedDataTypeCrashData', playName: 'App info and performance · Crash logs', label: 'Crash logs & diagnostics', purpose: 'NSPrivacyCollectedDataTypePurposeAnalytics', linked: false },
  { key: 'NSPrivacyCollectedDataTypeDeviceID', playName: 'Device or other IDs', label: 'Device identifier', purpose: 'NSPrivacyCollectedDataTypePurposeAnalytics', linked: false },
];

function buildXcprivacyXml({ tracking, domains, apis, dataTypes }) {
  const domainTags = domains.length
    ? `<array>\n${domains.map((d) => `    <string>${d.trim()}</string>`).join('\n')}\n  </array>`
    : '<array/>';

  const apiBlocks = apis.length
    ? `<array>\n${apis.map((a) => `    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>${a.key}</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>${a.reason}</string>
      </array>
    </dict>`).join('\n')}\n  </array>`
    : '<array/>';

  const dataBlocks = dataTypes.length
    ? `<array>\n${dataTypes.map((d) => `    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>${d.key}</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <${d.linked ? 'true' : 'false'}/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <${tracking ? 'true' : 'false'}/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>${d.purpose}</string>
      </array>
    </dict>`).join('\n')}\n  </array>`
    : '<array/>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <${tracking ? 'true' : 'false'}/>
  <key>NSPrivacyTrackingDomains</key>
  ${domainTags}
  <key>NSPrivacyAccessedAPITypes</key>
  ${apiBlocks}
  <key>NSPrivacyCollectedDataTypes</key>
  ${dataBlocks}
</dict>
</plist>
`;
}

export default function StorePrivacyBuilder() {
  const toast = useToast();
  const [tracking, setTracking] = useState(false);
  const [domainsText, setDomainsText] = useState('');
  const [selectedApis, setSelectedApis] = useState(['NSPrivacyAccessedAPICategoryUserDefaults']);
  const [selectedData, setSelectedData] = useState(['NSPrivacyCollectedDataTypeEmailAddress', 'NSPrivacyCollectedDataTypeCrashData']);
  const [encryptedInTransit, setEncryptedInTransit] = useState(true);
  const [deletionUrl, setDeletionUrl] = useState('https://example.com/delete-account');

  const toggle = (list, setList, key) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const domains = useMemo(
    () => domainsText.split(/[\n,]+/).map((d) => d.trim()).filter(Boolean),
    [domainsText],
  );
  const chosenApis = APPLE_APIS.filter((a) => selectedApis.includes(a.key));
  const chosenData = DATA_TYPES.filter((d) => selectedData.includes(d.key));

  const xml = useMemo(
    () => buildXcprivacyXml({ tracking, domains, apis: chosenApis, dataTypes: chosenData }),
    [tracking, domains, chosenApis, chosenData],
  );

  const playSummaryMarkdown = useMemo(() => [
    '# Google Play Data Safety Worksheet',
    '',
    `- Collects or shares user data: ${chosenData.length ? 'Yes' : 'No'}`,
    `- Data encrypted in transit (HTTPS/TLS): ${encryptedInTransit ? 'Yes' : 'No'}`,
    `- Account & data deletion URL: ${deletionUrl || '[Required if accounts are supported]'}`,
    `- Uses tracking/advertising SDKs: ${tracking ? 'Yes' : 'No'}`,
    '',
    '## Data Types to Declare',
    ...(chosenData.length
      ? chosenData.map((d) => `- **${d.playName}** — Collected: Yes | Shared: ${tracking ? 'Yes' : 'No'} | Purpose: ${d.purpose.includes('Analytics') ? 'Analytics' : 'App functionality'}`)
      : ['- None selected']),
  ].join('\n'), [chosenData, encryptedInTransit, deletionUrl, tracking]);

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: `${label} copied.` });
    } catch {
      toast.show({ message: 'Copy blocked by browser.', tone: 'error' });
    }
  };

  return (
    <div className="stack-md">
      <section className="card" aria-labelledby="manifest-config-title">
        <h2 id="manifest-config-title" className="card-title">Store Privacy Manifest &amp; Data Safety Builder</h2>
        <p className="card-subtitle">Select the Apple Required Reason APIs and data categories your app uses to generate both <code>PrivacyInfo.xcprivacy</code> and Google Play Data Safety answers in sync.</p>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <div>
            <h3 className="field-label">1. Apple Required Reason APIs</h3>
            <div className="stack-xs" style={{ marginTop: 6 }}>
              {APPLE_APIS.map((api) => (
                <label key={api.key} className="check-row">
                  <input type="checkbox" checked={selectedApis.includes(api.key)} onChange={() => toggle(selectedApis, setSelectedApis, api.key)} />
                  <span>{api.label}</span>
                </label>
              ))}
            </div>

            <h3 className="field-label" style={{ marginTop: 14 }}>2. Tracking &amp; Security Flags</h3>
            <label className="check-row">
              <input type="checkbox" checked={tracking} onChange={(e) => setTracking(e.target.checked)} />
              <span>App uses tracking (ATT / cross-app ad identifiers)</span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={encryptedInTransit} onChange={(e) => setEncryptedInTransit(e.target.checked)} />
              <span>All network data encrypted in transit (HTTPS / TLS)</span>
            </label>
            {tracking && (
              <div className="field" style={{ marginTop: 8 }}>
                <label className="field-label" htmlFor="tracking-domains">NSPrivacyTrackingDomains (comma or newline separated)</label>
                <input
                  id="tracking-domains"
                  className="input-field input-sm"
                  value={domainsText}
                  onChange={(e) => setDomainsText(e.target.value)}
                  placeholder="ads.example.com, metrics.example.com"
                />
              </div>
            )}
            <div className="field" style={{ marginTop: 8 }}>
              <label className="field-label" htmlFor="play-deletion-url">Play Store Account Deletion URL</label>
              <input
                id="play-deletion-url"
                className="input-field input-sm"
                value={deletionUrl}
                onChange={(e) => setDeletionUrl(e.target.value)}
                placeholder="https://yourapp.com/delete-account"
              />
            </div>
          </div>

          <div>
            <h3 className="field-label">3. Collected Data Categories</h3>
            <div className="stack-xs" style={{ marginTop: 6 }}>
              {DATA_TYPES.map((dt) => (
                <label key={dt.key} className="check-row">
                  <input type="checkbox" checked={selectedData.includes(dt.key)} onChange={() => toggle(selectedData, setSelectedData, dt.key)} />
                  <span>{dt.label} <span className="field-help">({dt.linked ? 'Linked to user' : 'Unlinked'})</span></span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="xcprivacy-title">
          <div className="section-header">
            <div className="source-head" style={{ alignItems: 'center' }}>
              <Apple aria-hidden="true" />
              <h3 id="xcprivacy-title" className="card-title">Apple <code>PrivacyInfo.xcprivacy</code></h3>
            </div>
            <div className="page-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(xml, 'PrivacyInfo.xcprivacy XML')}>
                <Copy aria-hidden="true" /> Copy XML
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => download('PrivacyInfo.xcprivacy', xml, 'application/xml;charset=utf-8')}>
                <FileDown aria-hidden="true" /> Download
              </button>
            </div>
          </div>
          <pre className="code-block" style={{ maxHeight: 360, overflow: 'auto', marginTop: 10 }}>{xml}</pre>
        </section>

        <section className="card" aria-labelledby="play-ds-title">
          <div className="section-header">
            <div className="source-head" style={{ alignItems: 'center' }}>
              <Play aria-hidden="true" />
              <h3 id="play-ds-title" className="card-title">Google Play Data Safety Matrix</h3>
            </div>
            <div className="page-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(playSummaryMarkdown, 'Play Data Safety summary')}>
                <Copy aria-hidden="true" /> Copy
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('play-data-safety.md', playSummaryMarkdown, 'text/markdown;charset=utf-8')}>
                <FileDown aria-hidden="true" /> .md
              </button>
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Play Console Category</th>
                  <th scope="col">Collected</th>
                  <th scope="col">Shared</th>
                  <th scope="col">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {chosenData.length === 0 ? (
                  <tr><td colSpan={4} className="muted">No data types selected (App declares no data collected).</td></tr>
                ) : (
                  chosenData.map((d) => (
                    <tr key={d.key}>
                      <td>{d.playName}</td>
                      <td>Yes</td>
                      <td>{tracking ? 'Yes' : 'No'}</td>
                      <td>{d.purpose.includes('Analytics') ? 'Analytics' : 'App functionality'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
