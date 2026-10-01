// Launch checklists. Each item links to the official source; rules change, so the page shows
// when the list was last reviewed. Keys are stored in profiles.launch_checklist: keep them stable.
export const LAST_REVIEWED = 'October 2026';

export const PLATFORMS = [
  {
    id: 'ios',
    label: 'iOS',
    title: 'App Store (iOS)',
    items: [
      { key: 'ios-program', text: 'Join the Apple Developer Program', detail: 'Needed to publish on the App Store and to use TestFlight.', source: 'https://developer.apple.com/programs/' },
      { key: 'ios-guidelines', text: 'Read the App Review Guidelines for your category', detail: 'Most rejections cite a specific guideline; reading the relevant sections first saves review rounds.', source: 'https://developer.apple.com/app-store/review/guidelines/' },
      { key: 'ios-privacy', text: 'Fill in App Privacy details and add a privacy policy URL', detail: 'Both are set in App Store Connect and shown on your product page.', source: 'https://developer.apple.com/app-store/app-privacy-details/' },
      { key: 'ios-manifest', text: 'Check your third-party SDKs for privacy manifests', detail: 'Apple requires privacy manifests and signatures for commonly used SDKs, and declared reasons for certain APIs.', source: 'https://developer.apple.com/support/third-party-SDK-requirements/' },
      { key: 'ios-iap', text: 'Sell digital content and features with In-App Purchase', detail: 'Guideline 3.1.1 covers unlocking features or content inside the app.', source: 'https://developer.apple.com/app-store/review/guidelines/#in-app-purchase' },
      { key: 'ios-small-business', text: 'Apply to the App Store Small Business Program', detail: 'For developers earning up to $1 million a year; it lowers the commission rate.', source: 'https://developer.apple.com/app-store/small-business-program/' },
    ],
  },
  {
    id: 'android',
    label: 'Android',
    title: 'Google Play (Android)',
    items: [
      { key: 'android-account', text: 'Create a Google Play Console developer account', detail: 'Personal and organization accounts have different verification and testing requirements.', source: 'https://play.google.com/console/signup' },
      { key: 'android-testing', text: 'Run a closed test with at least 12 testers for 14 days', detail: 'Required before production access for personal accounts created after 13 November 2023. Testers must stay opted in for 14 consecutive days.', source: 'https://support.google.com/googleplay/android-developer/answer/14151465' },
      { key: 'android-data-safety', text: 'Complete the Data safety form', detail: 'Describe what your app and its SDKs collect and share; it appears on your store listing.', source: 'https://support.google.com/googleplay/android-developer/answer/10787469' },
      { key: 'android-target', text: 'Target a recent Android API level', detail: 'New apps and updates must meet Google Play’s current target API level requirement.', source: 'https://developer.android.com/google/play/requirements/target-sdk' },
      { key: 'android-billing', text: 'Use Google Play Billing for digital goods', detail: 'Google Play’s Payments policy covers which purchases must go through Play Billing.', source: 'https://support.google.com/googleplay/android-developer/answer/9858738' },
    ],
  },
  {
    id: 'web',
    label: 'Web',
    title: 'Web apps and SaaS',
    items: [
      { key: 'web-privacy', text: 'Publish a privacy policy and terms of service', detail: 'Say what you collect, why, and which processors (such as Stripe or analytics) receive it.', source: 'https://commission.europa.eu/law/law-topic/data-protection_en' },
      { key: 'web-cookies', text: 'Ask before setting non-essential cookies for EU visitors', detail: 'Analytics and advertising cookies need consent; strictly necessary ones don’t.', source: 'https://gdpr.eu/cookies/' },
      { key: 'web-tax', text: 'Collect sales tax or VAT where it applies', detail: 'Digital sales are taxed where the customer is in many countries; Stripe Tax can calculate and collect it.', source: 'https://stripe.com/tax' },
      { key: 'web-license', text: 'Choose a licence before you publish code', detail: 'Without one, others have no right to use your code.', source: 'https://choosealicense.com/' },
    ],
  },
  {
    id: 'windows',
    label: 'Windows',
    title: 'Microsoft Store (Windows)',
    items: [
      { key: 'win-account', text: 'Register as a Microsoft Store developer', detail: 'Start from the publishing overview for Windows apps.', source: 'https://learn.microsoft.com/windows/apps/publish/' },
      { key: 'win-package', text: 'Package your app as MSIX, or submit your existing installer', detail: 'The Store accepts MSIX packages as well as MSI and EXE installers.', source: 'https://learn.microsoft.com/windows/msix/overview' },
      { key: 'win-signing', text: 'Code-sign installers you distribute outside the Store', detail: 'Unsigned downloads trigger SmartScreen warnings.', source: 'https://learn.microsoft.com/windows/msix/package/signing-package-overview' },
    ],
  },
];
