import test from "node:test";
import assert from "node:assert/strict";
import {
  onboardingReducer,
  createProject,
  readProject,
  PROJECT_KEY,
} from "../src/data/project.js";
const initial = () => ({
  step: 1,
  error: "",
  draft: { name: "", platform: "Web / SaaS", source: "" },
});
test("a blank project name keeps the user on the first step with an error", () => {
  const result = onboardingReducer(initial(), { type: "next" });
  assert.equal(result.step, 1);
  assert.match(result.error, /name/);
});
test("back and next preserve project and source choices", () => {
  let state = onboardingReducer(initial(), {
    type: "change",
    field: "name",
    value: "My project",
  });
  state = onboardingReducer(state, { type: "next" });
  assert.equal(state.step, 2);
  state = onboardingReducer(state, {
    type: "change",
    field: "source",
    value: "stripe",
  });
  state = onboardingReducer(state, { type: "back" });
  assert.equal(state.step, 1);
  state = onboardingReducer(state, { type: "next" });
  assert.equal(state.draft.source, "stripe");
  assert.equal(state.draft.name, "My project");
});
test("sample and skip produce distinct data states without authentication claims", () => {
  const sample = createProject(initial().draft, "sample");
  assert.equal(sample.name, "Sample project");
  assert.equal(sample.mode, "sample");
  const skip = createProject(
    { ...initial().draft, name: " Tool ", source: "stripe" },
    "empty",
  );
  assert.equal(skip.name, "Tool");
  assert.equal(skip.mode, "empty");
  assert.equal(skip.source, "stripe");
  assert.equal("isAuthenticated" in sample, false);
});
test("reload restores a valid workspace and safely ignores broken storage", () => {
  const project = createProject(
    { ...initial().draft, name: "Persist me" },
    "sample",
  );
  assert.deepEqual(
    readProject({
      getItem: (key) => (key === PROJECT_KEY ? JSON.stringify(project) : null),
    }),
    project,
  );
  for (const value of [
    "bad json",
    "null",
    '{"version":1}',
    JSON.stringify({ ...project, mode: "live" }),
  ])
    assert.equal(readProject({ getItem: () => value }), null);
  assert.equal(
    readProject({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
    null,
  );
});
