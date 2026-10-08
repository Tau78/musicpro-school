import { afterEach, describe, expect, it } from "vitest";

import {
  getLessonsModuleMode,
  isLessonsModuleEnabled,
  isLessonsPath,
  isLessonsSandboxMode,
} from "./lessons-module";

const envKeys = [
  "NEXT_PUBLIC_LESSONS_MODULE",
  "LESSONS_MODULE",
] as const;

function clearLessonsEnv() {
  for (const key of envKeys) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearLessonsEnv();
});

describe("lessons-module", () => {
  it("default live quando env assente", () => {
    clearLessonsEnv();
    expect(getLessonsModuleMode()).toBe("live");
    expect(isLessonsModuleEnabled()).toBe(true);
    expect(isLessonsSandboxMode()).toBe(false);
  });

  it("off disabilita il modulo", () => {
    process.env.NEXT_PUBLIC_LESSONS_MODULE = "off";
    expect(getLessonsModuleMode()).toBe("off");
    expect(isLessonsModuleEnabled()).toBe(false);
  });

  it("sandbox abilita con flag sandbox", () => {
    process.env.NEXT_PUBLIC_LESSONS_MODULE = "sandbox";
    expect(getLessonsModuleMode()).toBe("sandbox");
    expect(isLessonsModuleEnabled()).toBe(true);
    expect(isLessonsSandboxMode()).toBe(true);
  });

  it("riconosce i path lezioni", () => {
    expect(isLessonsPath("/admin/lezioni/corsi")).toBe(true);
    expect(isLessonsPath("/lezioni/oggi")).toBe(true);
    expect(isLessonsPath("/api/lezioni/reminders")).toBe(true);
    expect(isLessonsPath("/tabellone/abc")).toBe(true);
    expect(isLessonsPath("/prenotazioni")).toBe(false);
    expect(isLessonsPath("/admin/prenotazioni")).toBe(false);
  });
});
