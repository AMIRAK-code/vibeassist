// Launch checklists. Each item links to the official source; rules change, so the page shows
// when the list was last reviewed. Keys are stored in profiles.launch_checklist: keep them stable.
export const LAST_REVIEWED = 'November 2026';

export const CARD_ORDER = ['ios', 'android', 'windows', 'web', 'mac', 'ai_safety'];

export const PLATFORMS = [
  {
    id: 'ios',
    label: 'iOS',
    title: 'App Store (iOS)',
    card: {
      title: 'iOS & App Store',
      guide: 'Read iOS Guide',
      summary: 'App Review guidelines, App Privacy details and SDK privacy manifests, In-App Purchase rules, and the Small Business Program that lowers Apple’s commission.',
    },
    items: [
      { key: 'ios-program', priority: 'required', text: 'Join the Apple Developer Program', detail: 'Needed to publish on the App Store and to use TestFlight.', source: 'https://developer.apple.com/programs/' },
      { key: 'ios-guidelines', priority: 'required', text: 'Read the App Review Guidelines for your category', detail: 'Most rejections cite a specific guideline; reading the relevant sections first saves review rounds.', source: 'https://developer.apple.com/app-store/review/guidelines/' },
      { key: 'ios-privacy', priority: 'required', text: 'Fill in App Privacy details and add a privacy policy URL', detail: 'Both are set in App Store Connect and shown on your product page.', source: 'https://developer.apple.com/app-store/app-privacy-details/' },
      { key: 'ios-manifest', priority: 'required', text: 'Check your third-party SDKs for privacy manifests', detail: 'Apple requires privacy manifests (PrivacyInfo.xcprivacy) and signatures for commonly used SDKs, and declared reasons for certain APIs.', source: 'https://developer.apple.com/support/third-party-SDK-requirements/' },
      { key: 'ios-iap', priority: 'required', text: 'Sell digital content and features with In-App Purchase', detail: 'Guideline 3.1.1 covers unlocking features or content inside the app.', source: 'https://developer.apple.com/app-store/review/guidelines/#in-app-purchase' },
      { key: 'ios-deletion', priority: 'required', text: 'Offer in-app account deletion if users can create accounts', detail: 'Guideline 5.1.1(v) requires apps that support account creation to let users delete their account directly inside the app.', source: 'https://developer.apple.com/support/offering-account-deletion-in-your-app/' },
      { key: 'ios-small-business', priority: 'recommended', text: 'Apply to the App Store Small Business Program', detail: 'For developers earning up to $1 million a year; it lowers the commission rate to 15%.', source: 'https://developer.apple.com/app-store/small-business-program/' },
    ],
  },
  {
    id: 'android',
    label: 'Android',
    title: 'Google Play (Android)',
    card: {
      title: 'Android & Play Store',
      guide: 'Read Android Guide',
      summary: 'The closed test with 12 testers for 14 days that new personal accounts need, the Data safety form, target API level and Play Billing.',
    },
    items: [
      { key: 'android-account', priority: 'required', text: 'Create a Google Play Console developer account', detail: 'Personal and organization accounts have different verification and testing requirements.', source: 'https://play.google.com/console/signup' },
      { key: 'android-testing', priority: 'required', text: 'Run a closed test with at least 12 testers for 14 days', detail: 'Required before production access for personal accounts created after 13 November 2023. Testers must stay opted in for 14 consecutive days.', source: 'https://support.google.com/googleplay/android-developer/answer/14151465' },
      { key: 'android-data-safety', priority: 'required', text: 'Complete the Data safety form', detail: 'Describe what your app and its SDKs collect and share; it appears on your store listing.', source: 'https://support.google.com/googleplay/android-developer/answer/10787469' },
      { key: 'android-deletion', priority: 'required', text: 'Publish a web link for account & data deletion', detail: 'Google Play requires both an in-app path and a web URL inside the Data safety form for apps allowing account creation.', source: 'https://support.google.com/googleplay/android-developer/answer/13327111' },
      { key: 'android-target', priority: 'required', text: 'Target a recent Android API level', detail: 'New apps and updates must meet Google Play’s current target API level requirement.', source: 'https://developer.android.com/google/play/requirements/target-sdk' },
      { key: 'android-billing', priority: 'required', text: 'Use Google Play Billing for digital goods', detail: 'Google Play’s Payments policy covers which purchases must go through Play Billing.', source: 'https://support.google.com/googleplay/android-developer/answer/9858738' },
    ],
  },
  {
    id: 'web',
    label: 'Web',
    title: 'Web apps and SaaS',
    card: {
      title: 'Linux & Web (SaaS)',
      guide: 'Read Web/Linux Guide',
      summary: 'Privacy policy and terms, cookie consent for EU visitors, security headers, sales tax and VAT on digital sales, and choosing an open-source licence.',
    },
    items: [
      { key: 'web-privacy', priority: 'required', text: 'Publish a privacy policy and terms of service', detail: 'Say what you collect, why, and which processors (such as Stripe or analytics) receive it.', source: 'https://commission.europa.eu/law/law-topic/data-protection_en' },
      { key: 'web-cookies', priority: 'required', text: 'Ask before setting non-essential cookies for EU visitors', detail: 'Analytics and advertising cookies need consent; strictly necessary ones don’t.', source: 'https://gdpr.eu/cookies/' },
      { key: 'web-headers', priority: 'recommended', text: 'Ship HSTS, CSP and X-Frame-Options security headers', detail: 'Prevents clickjacking, MIME sniffing and cross-site script injection across browsers.', source: 'https://owasp.org/www-project-secure-headers/' },
      { key: 'web-tax', priority: 'required', text: 'Collect sales tax or VAT where it applies', detail: 'Digital sales are taxed where the customer is in many countries; Stripe Tax can calculate and collect it.', source: 'https://stripe.com/tax' },
      { key: 'web-license', priority: 'recommended', text: 'Choose a licence before you publish code', detail: 'Without one, others have no right to use your code.', source: 'https://choosealicense.com/' },
    ],
  },
  {
    id: 'windows',
    label: 'Windows',
    title: 'Microsoft Store (Windows)',
    card: {
      title: 'Windows (MS Store)',
      guide: 'Read Windows Guide',
      summary: 'Registering as a Store developer, MSIX packaging or your existing installer, and code signing so SmartScreen doesn’t warn people.',
    },
    items: [
      { key: 'win-account', priority: 'required', text: 'Register as a Microsoft Store developer', detail: 'Start from the publishing overview for Windows apps.', source: 'https://learn.microsoft.com/windows/apps/publish/' },
      { key: 'win-package', priority: 'required', text: 'Package your app as MSIX, or submit your existing installer', detail: 'The Store accepts MSIX packages as well as MSI and EXE installers.', source: 'https://learn.microsoft.com/windows/msix/overview' },
      { key: 'win-signing', priority: 'recommended', text: 'Code-sign installers you distribute outside the Store', detail: 'Unsigned downloads trigger SmartScreen warnings.', source: 'https://learn.microsoft.com/windows/msix/package/signing-package-overview' },
    ],
  },
  {
    id: 'mac',
    label: 'macOS',
    title: 'macOS & Notarization',
    card: {
      title: 'macOS (App Store & Direct)',
      guide: 'Read macOS Guide',
      summary: 'Hardened Runtime, Developer ID signing, Apple Notarization for direct .dmg/.pkg downloads, and App Sandbox rules.',
    },
    items: [
      { key: 'mac-signing', priority: 'required', text: 'Enable Hardened Runtime and sign with Developer ID', detail: 'Required before distributing macOS binaries outside the Mac App Store.', source: 'https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution' },
      { key: 'mac-notarize', priority: 'required', text: 'Submit builds through Apple Notary Service and staple ticket', detail: 'Prevents Gatekeeper from blocking first launch on users’ Macs.', source: 'https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution' },
      { key: 'mac-sandbox', priority: 'recommended', text: 'Configure App Sandbox entitlements for Mac App Store builds', detail: 'Restrict network, file and hardware entitlements strictly to what your app needs.', source: 'https://developer.apple.com/documentation/security/app_sandbox' },
    ],
  },
  {
    id: 'ai_safety',
    label: 'AI & Security',
    title: 'AI & Application Security',
    card: {
      title: 'AI Compliance & Security',
      guide: 'Read Security Guide',
      summary: 'Key exposure hygiene, database RLS policies, LLM spend caps, prompt-injection boundaries, and AI transparency disclosures.',
    },
    items: [
      { key: 'sec-secrets', priority: 'required', text: 'Audit repo & build artifacts for leaked API keys', detail: 'Ensure private/secret keys never enter browser bundles or client localStorage by default.', source: 'https://owasp.org/www-project-top-ten/' },
      { key: 'sec-rls', priority: 'required', text: 'Verify Row-Level Security (RLS) on every database table', detail: 'Test cross-tenant reads and updates with an authenticated user token before launch.', source: 'https://supabase.com/docs/guides/database/postgres/row-level-security' },
      { key: 'ai-disclosure', priority: 'required', text: 'Disclose AI processors and training opt-outs in your Privacy Policy', detail: 'List external LLM APIs (Gemini, Claude, OpenAI) and tell users when data stays local vs cloud.', source: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai' },
      { key: 'ai-rate-limits', priority: 'recommended', text: 'Enforce per-user rate limits and spend caps on AI endpoints', detail: 'Guard against abuse and runaway token bills with daily quotas and max token limits.', source: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/' },
    ],
  },
];
