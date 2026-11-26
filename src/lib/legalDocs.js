// The Legal Document Generator's answers, checks, deterministic builder, auditor and exports.

export const DOC_KINDS = [
  { value: 'privacy', label: 'Privacy Policy', dbKind: 'privacy' },
  { value: 'terms', label: 'Terms of Service', dbKind: 'terms' },
  { value: 'eula', label: 'EULA', dbKind: 'eula' },
  { value: 'cookies', label: 'Cookie Policy', dbKind: 'privacy' },
  { value: 'dpa', label: 'Data Processing Agreement', dbKind: 'privacy' },
  { value: 'ai_policy', label: 'AI Transparency & Acceptable Use', dbKind: 'terms' },
  { value: 'refunds', label: 'Refund & Cancellation Policy', dbKind: 'terms' },
];

export const dbKindFor = (kind) => DOC_KINDS.find((k) => k.value === kind)?.dbKind ?? 'privacy';
export const effectiveKind = (doc) => doc?.inputs?.docKind || doc?.kind || 'privacy';
export const kindLabel = (kind) => DOC_KINDS.find((k) => k.value === kind)?.label ?? kind;

export const PLATFORM_OPTIONS = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: 'Web' },
  { value: 'windows', label: 'Windows' },
  { value: 'mac', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
];

export const JURISDICTION_OPTIONS = [
  { value: 'gdpr', label: 'GDPR (EU & UK)' },
  { value: 'ccpa', label: 'CCPA / CPRA (California)' },
  { value: 'eu_ai_act', label: 'EU AI Act Transparency' },
  { value: 'apple_eula', label: 'Apple App Store Minimum EULA' },
  { value: 'coppa', label: 'COPPA (Under-13 rules)' },
];

export const DATA_OPTIONS = [
  { value: 'email', label: 'Email address' },
  { value: 'name', label: 'Name' },
  { value: 'account', label: 'Account login' },
  { value: 'payments', label: 'Payment details (via a payment provider)' },
  { value: 'usage', label: 'Usage analytics' },
  { value: 'crash', label: 'Crash reports and diagnostics' },
  { value: 'device', label: 'Device identifiers' },
  { value: 'advertising_id', label: 'Advertising identifier' },
  { value: 'location', label: 'Location' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'photos', label: 'Photos or files' },
  { value: 'health', label: 'Health or fitness data' },
  { value: 'user_content', label: 'Content users create' },
  { value: 'ai_prompts', label: 'AI prompts & outputs' },
];

export const SERVICE_OPTIONS = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'lemonsqueezy', label: 'Lemon Squeezy / Paddle' },
  { value: 'revenuecat', label: 'RevenueCat' },
  { value: 'firebase', label: 'Firebase / Google Analytics' },
  { value: 'posthog', label: 'PostHog' },
  { value: 'supabase', label: 'Supabase' },
  { value: 'clerk', label: 'Clerk / Auth0' },
  { value: 'resend', label: 'Resend / Postmark' },
  { value: 'admob', label: 'Google AdMob' },
  { value: 'meta_sdk', label: 'Meta SDK' },
  { value: 'sentry', label: 'Sentry' },
  { value: 'mixpanel', label: 'Mixpanel / Amplitude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ollama_local', label: 'Local / On-device AI (Ollama)' },
  { value: 'aws', label: 'AWS' },
  { value: 'vercel', label: 'Vercel / Cloudflare' },
];

export const MONETIZATION_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'ads', label: 'Ads' },
  { value: 'iap', label: 'In-app purchases' },
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'paid', label: 'Paid upfront' },
];

export const EMPTY_INPUTS = {
  appName: '', developerName: '', contactEmail: '', country: '', website: '',
  platforms: [], data: [], services: [], otherServices: '', monetization: [],
  jurisdictions: [], children: false, accountDeletion: '', effectiveDate: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInputs(inputs) {
  const errors = {};
  if (!String(inputs.appName ?? '').trim()) errors.appName = 'Name the app.';
  else if (inputs.appName.trim().length > 80) errors.appName = 'Keep it under 80 characters.';
  if (!String(inputs.developerName ?? '').trim()) errors.developerName = 'Who publishes it: your full name or your company.';
  if (!EMAIL.test(String(inputs.contactEmail ?? '').trim())) errors.contactEmail = 'An email address people can write to about the app.';
  if (!String(inputs.country ?? '').trim()) errors.country = 'The country you (or your company) are based in.';
  if (String(inputs.website ?? '').trim() && !/^https?:\/\/\S+\.\S+/.test(inputs.website.trim())) errors.website = 'Start with https://';
  if (!inputs.platforms?.length) errors.platforms = 'Pick at least one platform.';
  if (!inputs.monetization?.length) errors.monetization = 'Pick at least one.';
  if ((inputs.otherServices ?? '').length > 200) errors.otherServices = 'Keep it under 200 characters.';
  if ((inputs.accountDeletion ?? '').length > 300) errors.accountDeletion = 'Keep it under 300 characters.';
  return errors;
}

export function bodyBlocks(body) {
  const blocks = [];
  for (const chunk of String(body ?? '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-•*]\s+/.test(l))) {
      blocks.push({ type: 'ul', items: lines.map((l) => l.replace(/^[-•*]\s+/, '')) });
    } else {
      blocks.push({ type: 'p', text: lines.join(' ') });
    }
  }
  return blocks;
}

export function toPlainText(doc) {
  return [doc.title, '', ...doc.sections.flatMap((s) => [s.heading, '', s.body.trim(), ''])].join('\n').trim();
}

export function toMarkdown(doc) {
  return [`# ${doc.title}`, '', ...doc.sections.flatMap((s) => [`## ${s.heading}`, '', s.body.trim(), ''])].join('\n').trim() + '\n';
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtml(doc) {
  const body = doc.sections.map((s) => {
    const blocks = bodyBlocks(s.body).map((b) => (b.type === 'ul'
      ? `<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
      : `<p>${escapeHtml(b.text)}</p>`)).join('\n');
    return `<h2>${escapeHtml(s.heading)}</h2>\n${blocks}`;
  }).join('\n');
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(doc.title)}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;color:#171717}h2{margin-top:2em}</style>\n</head>\n<body>\n<h1>${escapeHtml(doc.title)}</h1>\n${body}\n</body>\n</html>\n`;
}

export function fileName(doc, extension) {
  const slug = `${kindLabel(effectiveKind(doc))} ${doc.inputs?.appName ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'document'}.${extension}`;
}

export function extractPlaceholders(doc) {
  const seen = new Set();
  for (const s of doc?.sections ?? []) {
    for (const match of String(s.body ?? '').match(/\[[^\]]+\]/g) ?? []) {
      seen.add(match);
    }
  }
  return [...seen];
}

export function countPlaceholders(doc) {
  return (doc?.sections ?? []).reduce((n, s) => n + (s.body.match(/\[[^\]]+\]/g)?.length ?? 0), 0);
}

export function applyPlaceholderReplacements(sections, replacements) {
  return (sections ?? []).map((s) => {
    let body = s.body;
    for (const [token, value] of Object.entries(replacements ?? {})) {
      if (value && value.trim()) body = body.split(token).join(value.trim());
    }
    return { ...s, body };
  });
}

const labelsFrom = (options, selected) =>
  (selected ?? []).map((val) => options.find((o) => o.value === val)?.label ?? val);

export function buildDeterministicDraft(kind, rawInputs) {
  const inputs = { ...EMPTY_INPUTS, ...rawInputs };
  const app = inputs.appName.trim() || '[App Name]';
  const dev = inputs.developerName.trim() || '[Publisher Name]';
  const email = inputs.contactEmail.trim() || '[support email]';
  const country = inputs.country.trim() || '[Country]';
  const effective = inputs.effectiveDate || '[Effective Date]';
  const web = inputs.website.trim() || '[Website URL]';
  const platforms = labelsFrom(PLATFORM_OPTIONS, inputs.platforms);
  const dataItems = labelsFrom(DATA_OPTIONS, inputs.data);
  const serviceItems = [
    ...labelsFrom(SERVICE_OPTIONS, inputs.services),
    ...(inputs.otherServices?.trim() ? [inputs.otherServices.trim()] : []),
  ];
  const models = labelsFrom(MONETIZATION_OPTIONS, inputs.monetization);
  const jurisdictions = new Set(inputs.jurisdictions ?? []);
  const deletion = inputs.accountDeletion.trim() || `Email ${email} or use the in-app account deletion option`;
  const usesAi = inputs.services?.some((s) => ['openai', 'anthropic', 'gemini', 'ollama_local'].includes(s)) || inputs.data?.includes('ai_prompts');

  if (kind === 'privacy') {
    return {
      title: `Privacy Policy for ${app}`,
      sections: [
        {
          heading: '1. Overview and Controller',
          body: `This Privacy Policy explains how ${dev} ("we", "us") collects, uses, and protects information when you use ${app} across ${platforms.join(', ')} (${web}).\n\nEffective date: ${effective}. Controller location: ${country}. Privacy contact: ${email}.`,
        },
        {
          heading: '2. Information We Collect',
          body: dataItems.length
            ? `Depending on how you use ${app}, we process the following categories of information:\n\n${dataItems.map((d) => `- ${d}`).join('\n')}`
            : `${app} does not intentionally collect personal data beyond essential diagnostic logs required to deliver the service. Replace this paragraph if additional data is collected.`,
        },
        {
          heading: '3. Third-Party Services & Processors',
          body: serviceItems.length
            ? `We share only the minimum data needed with the following infrastructure, billing, analytics, or AI providers:\n\n${serviceItems.map((s) => `- ${s}`).join('\n')}\n\nEach processor is bound by contractual data protection obligations. ${usesAi ? 'Where AI providers are used, inputs are sent only when you trigger an AI action.' : ''}`
            : `We do not share your personal information with third-party data brokers or external advertising networks.`,
        },
        {
          heading: '4. Data Retention and Account Deletion',
          body: `We retain personal data only as long as necessary to operate ${app}, satisfy tax/accounting rules (typically [retention period, e.g. 7 or 10 years for invoices]), or resolve disputes.\n\nHow to delete your account and data: ${deletion}. Verified deletion requests are completed within 30 days.`,
        },
        {
          heading: '5. Your Privacy Rights',
          body: `You may request access, correction, export, or deletion of your personal data at any time by writing to ${email}.${jurisdictions.has('gdpr') ? '\n\nEEA & UK Users (GDPR): You have the right to object to processing, withdraw consent, request portability, and lodge a complaint with your local Data Protection Authority.' : ''}${jurisdictions.has('ccpa') ? '\n\nCalifornia Users (CCPA/CPRA): You have the right to know what personal information is collected, request deletion, and opt out of any "sale" or "sharing" of personal data. We do not sell personal information.' : ''}`,
        },
        {
          heading: '6. Children and Age Limits',
          body: inputs.children
            ? `${app} includes experiences intended for users under 13. We apply parental consent checks and COPPA safeguards. Parents may review or delete a child's data via ${email}.`
            : `${app} is not directed to children under 13 (or the minimum digital consent age in your country, such as 16 in certain EU member states). If we learn a child submitted personal data without consent, we will delete it promptly.`,
        },
      ],
    };
  }

  if (kind === 'cookies') {
    return {
      title: `Cookie & Local Storage Policy for ${app}`,
      sections: [
        {
          heading: '1. What This Policy Covers',
          body: `This policy explains how ${dev} uses cookies, browser localStorage, sessionStorage, and similar identifiers inside ${app} (${web}). Contact: ${email}. Effective: ${effective}.`,
        },
        {
          heading: '2. Strictly Necessary Storage',
          body: `Essential cookies and browser storage are required to keep you signed in, remember interface preferences, protect forms against CSRF attacks, and process payments safely.`,
        },
        {
          heading: '3. Analytics, AI Keys & Preferences',
          body: `Optional analytics or advertising cookies (${inputs.services.filter((s) => ['firebase', 'posthog', 'mixpanel', 'admob', 'meta_sdk'].includes(s)).join(', ') || 'none enabled by default'}) run only with your consent where required by EU ePrivacy and GDPR rules.\n\nWhere ${app} lets you enter your own AI API keys or local endpoint URLs, those settings are stored strictly inside your own browser storage unless you explicitly choose encrypted cloud sync.`,
        },
        {
          heading: '4. Managing Your Choices',
          body: `You can clear browser storage or disable cookies in your browser or device settings at any time. Blocking strictly necessary cookies may prevent sign-in from working.`,
        },
      ],
    };
  }

  if (kind === 'dpa') {
    return {
      title: `Data Processing Agreement (DPA) for ${app}`,
      sections: [
        {
          heading: '1. Parties and Scope',
          body: `This Data Processing Agreement ("DPA") forms part of the Terms between ${dev} ("Processor", based in ${country}) and the business customer ("Controller") using ${app}. Effective date: ${effective}. Privacy contact: ${email}.`,
        },
        {
          heading: '2. Nature, Purpose, and Categories of Data',
          body: `Processor processes Customer Data solely on documented instructions to provide ${app} across ${platforms.join(', ')}.\n\nCategories of personal data:\n\n${(dataItems.length ? dataItems : ['Account identifiers and usage records']).map((d) => `- ${d}`).join('\n')}`,
        },
        {
          heading: '3. Security Measures and Subprocessors',
          body: `Processor implements encryption in transit (TLS 1.2+), encrypted secret storage, least-privilege access controls, and prompt breach notification within [breach notification window, e.g. 48 or 72 hours].\n\nAuthorized Subprocessors:\n\n${(serviceItems.length ? serviceItems : ['[List cloud hosting and email subprocessors]']).map((s) => `- ${s}`).join('\n')}`,
        },
        {
          heading: '4. International Transfers & Deletion',
          body: `Cross-border transfers outside the EEA/UK rely on EU Standard Contractual Clauses (SCCs) or an adequacy decision. Upon termination, Processor deletes or returns Customer Data within 30 days unless law requires retention.`,
        },
      ],
    };
  }

  if (kind === 'ai_policy') {
    return {
      title: `AI Transparency & Acceptable Use Policy for ${app}`,
      sections: [
        {
          heading: '1. How AI Features Work in ' + app,
          body: `${app} (published by ${dev}) uses artificial intelligence features to assist users across ${platforms.join(', ')}. Effective date: ${effective}. Contact: ${email}.`,
        },
        {
          heading: '2. Model Providers and Training Opt-Out',
          body: `Depending on your settings, requests are processed by:\n\n${(serviceItems.filter((s) => /openai|anthropic|gemini|ollama|ai/i.test(s)).length ? serviceItems.filter((s) => /openai|anthropic|gemini|ollama|ai/i.test(s)) : ['Configured AI model providers']).map((s) => `- ${s}`).join('\n')}\n\nWhen you connect your own API key or a local model (such as Ollama or LM Studio), your prompts are sent directly under your own provider terms or remain completely on your device.`,
        },
        {
          heading: '3. Accuracy, Human Oversight & Limitations',
          body: `AI outputs are generated probabilistically and can be inaccurate, incomplete, or outdated. Outputs do not constitute legal, tax, medical, or investment advice. You must review generated code, legal drafts, and financial summaries before relying on them.${jurisdictions.has('eu_ai_act') ? '\n\nEU AI Act Notice: Users are informed whenever they interact with automated AI generation or decision-support summaries.' : ''}`,
        },
        {
          heading: '4. Prohibited Uses',
          body: `- Generating malware, exploits, or automated abuse against third-party systems.\n- Submitting confidential third-party personal data without authorization.\n- Attempting prompt injection, rate-limit circumvention, or credential extraction.`,
        },
      ],
    };
  }

  if (kind === 'refunds') {
    return {
      title: `Refund & Cancellation Policy for ${app}`,
      sections: [
        {
          heading: '1. Scope and Seller Details',
          body: `This policy governs paid purchases, subscriptions, and one-time passes in ${app}, offered by ${dev} (${country}). Billing support: ${email}. Effective: ${effective}.`,
        },
        {
          heading: '2. Cancelling Subscriptions',
          body: `Models offered: ${models.join(', ')}. You may cancel an active subscription at any time from your account billing settings or the store where you subscribed (Apple App Store / Google Play). Access continues until the end of the current billing period.`,
        },
        {
          heading: '3. Refund Eligibility',
          body: `- First-time direct web purchases: full refund within [refund window, e.g. 14 days] of initial payment by emailing ${email}.\n- App Store & Google Play purchases: processed under Apple's or Google's store refund workflows.\n- Statutory consumer rights under applicable local law remain unaffected.`,
        },
      ],
    };
  }

  if (kind === 'eula') {
    return {
      title: `End User License Agreement (EULA) for ${app}`,
      sections: [
        {
          heading: '1. License Grant',
          body: `${dev} grants you a personal, non-exclusive, non-transferable, revocable license to install and run ${app} on compatible ${platforms.join(', ')} devices for your lawful personal or internal business purposes. Effective: ${effective}.`,
        },
        {
          heading: '2. Restrictions and Intellectual Property',
          body: `You may not reverse engineer, redistribute, sublicense, or bypass licensing controls in ${app}, except where explicitly allowed by mandatory law or open-source components included with the software.`,
        },
        {
          heading: '3. Payments, Subscriptions, and Updates',
          body: `Pricing models: ${models.join(', ')}. Updates may modify or discontinue features over time. Support contact: ${email}.`,
        },
        {
          heading: '4. Store-Specific Terms & Liability',
          body: `${jurisdictions.has('apple_eula') ? 'Apple App Store Notice: This EULA is between you and ' + dev + ', not Apple Inc. Apple has no maintenance or support obligation for ' + app + ', and is a third-party beneficiary able to enforce this EULA.\n\n' : ''}To the maximum extent permitted by ${country} law, ${app} is provided "as is" and total aggregate liability is capped at [liability cap, e.g. amounts paid in the preceding 12 months].`,
        },
      ],
    };
  }

  return {
    title: `Terms of Service for ${app}`,
    sections: [
      {
        heading: '1. Agreement and Eligibility',
        body: `By accessing ${app} (${web}) on ${platforms.join(', ')}, you agree to these Terms of Service with ${dev}, based in ${country}. Contact: ${email}. Effective date: ${effective}.\n\nYou must be at least 18 (or the age of majority in your jurisdiction) to enter a binding contract.`,
      },
      {
        heading: '2. Accounts and Acceptable Use',
        body: `Keep your login credentials and API keys confidential. You agree not to misuse ${app}, probe unauthorized endpoints, bypass rate limits, or upload illegal or infringing content. Account deletion: ${deletion}.`,
      },
      {
        heading: '3. Pricing, Billing & Renewals',
        body: `Business model: ${models.join(', ')}. Subscriptions renew automatically until cancelled before the renewal date. Taxes/VAT are calculated at checkout where required. See [link to refund policy] for refund rules.`,
      },
      {
        heading: '4. AI Outputs and Disclaimers',
        body: `${usesAi ? 'Outputs generated by integrated AI models are informational drafts and can contain errors; verify them before acting or publishing.\n\n' : ''}${app} is provided "as is" without warranties of uninterrupted availability. Governing law: ${country}, subject to mandatory consumer protections in your country of residence.`,
      },
    ],
  };
}

export function auditLegalDocument(doc, inputs = {}) {
  const fullText = toPlainText(doc).toLowerCase();
  const kind = effectiveKind(doc);
  const checks = [
    {
      id: 'placeholders',
      label: 'All [placeholders] filled in',
      ok: countPlaceholders(doc) === 0,
      hint: `${countPlaceholders(doc)} placeholder(s) remaining`,
    },
    {
      id: 'contact',
      label: 'Support / privacy contact email included',
      ok: Boolean(inputs.contactEmail && fullText.includes(inputs.contactEmail.toLowerCase())) || /@/.test(fullText),
      hint: 'Store reviewers require an active support or privacy email.',
    },
  ];

  if (kind === 'privacy' || kind === 'dpa') {
    checks.push({
      id: 'deletion',
      label: 'Account & data deletion instructions present',
      ok: /delet|eras|remov/.test(fullText),
      hint: 'Required by Apple Guideline 5.1.1(v), Google Play Data Safety, and GDPR Art. 17.',
    });
    const services = inputs.services ?? [];
    if (services.length) {
      const missingServices = services.filter((s) => {
        const lbl = SERVICE_OPTIONS.find((o) => o.value === s)?.label ?? s;
        return !fullText.includes(lbl.split(' ')[0].toLowerCase());
      });
      checks.push({
        id: 'processors',
        label: 'Selected third-party processors named',
        ok: missingServices.length === 0,
        hint: missingServices.length ? `Missing mention of: ${missingServices.join(', ')}` : 'All selected subprocessors mentioned.',
      });
    }
    if (inputs.jurisdictions?.includes('gdpr')) {
      checks.push({
        id: 'gdpr',
        label: 'GDPR rights & authority disclosure included',
        ok: /gdpr|eea|portab|withdraw|authority/.test(fullText),
        hint: 'Add right to access, erasure, portability, and supervisory complaint.',
      });
    }
  }

  if (kind === 'terms' || kind === 'eula' || kind === 'refunds') {
    checks.push({
      id: 'billing',
      label: 'Billing, renewal or cancellation terms addressed',
      ok: /cancel|renew|refund|free|licens/.test(fullText),
      hint: 'Explain subscriptions, cancellations, and refunds clearly.',
    });
  }

  if (kind === 'ai_policy' || inputs.services?.some((s) => ['openai', 'anthropic', 'gemini', 'ollama_local'].includes(s))) {
    checks.push({
      id: 'ai',
      label: 'AI model disclosure & accuracy disclaimer included',
      ok: /artificial intelligence|\bai\b|model|claude|openai|gemini|ollama/.test(fullText),
      hint: 'Disclose AI processors and clarify outputs are not professional advice.',
    });
  }

  return checks;
}
