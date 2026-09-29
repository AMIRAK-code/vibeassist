export const PROJECT_KEY = "vibeassist.project.v1";
export const platforms = [
  "Web / SaaS",
  "iOS",
  "Android",
  "Desktop",
  "Multiple platforms",
];
export const sources = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Revenue and subscriptions for web products.",
  },
  {
    id: "apple",
    name: "App Store Connect",
    description: "Sales and downloads for iOS apps.",
  },
  {
    id: "google",
    name: "Google Play",
    description: "Sales and downloads for Android apps.",
  },
];
export function validateProject(project) {
  if (!project.name.trim()) return "Give your project a name to continue.";
  if (project.name.trim().length > 80)
    return "Keep the project name to 80 characters or fewer.";
  if (!platforms.includes(project.platform))
    return "Choose a platform for your project.";
  return "";
}
export function createProject(draft, mode) {
  return {
    version: 1,
    name:
      draft.name.trim() ||
      (mode === "sample" ? "Sample project" : "Untitled project"),
    platform: draft.platform,
    source: sources.some((source) => source.id === draft.source)
      ? draft.source
      : "",
    mode: mode === "sample" ? "sample" : "empty",
  };
}
export function readProject(storage) {
  try {
    const value = JSON.parse(storage.getItem(PROJECT_KEY));
    if (
      !value ||
      value.version !== 1 ||
      typeof value.name !== "string" ||
      validateProject(value) ||
      !["sample", "empty"].includes(value.mode)
    )
      return null;
    return createProject(value, value.mode);
  } catch {
    return null;
  }
}
export function onboardingReducer(state, action) {
  switch (action.type) {
    case "change":
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
        error: "",
      };
    case "next": {
      const error = validateProject(state.draft);
      return { ...state, error, step: error ? 1 : 2 };
    }
    case "back":
      return { ...state, step: 1, error: "" };
    default:
      return state;
  }
}
