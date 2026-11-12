import { describe, expect, it } from "vitest";
import { labEnabled, labKey, parseLabs } from "./labs";

describe("labs", () => {
  it("reads PUBLIC_LABS: known names only, blanks and spaces ignored", () => {
    expect(parseLabs(undefined)).toEqual([]);
    expect(parseLabs("")).toEqual([]);
    expect(parseLabs(" recording , follow_me,nope,")).toEqual(["follow_me", "recording"]);
  });

  it("is off by default", () => {
    expect(labEnabled("follow_me", undefined, undefined)).toBe(false);
    expect(labEnabled("follow_me", {}, [])).toBe(false);
  });

  it("follows the deployment's default when remote config says nothing", () => {
    expect(labEnabled("recording", {}, ["recording"])).toBe(true);
    expect(labEnabled("follow_me", {}, ["recording"])).toBe(false);
  });

  it("lets a remote-config bool override the default either way (the kill switch), and ignores a non-bool", () => {
    expect(labKey("follow_me")).toBe("feature.reader.labs.follow_me");
    expect(labEnabled("follow_me", { "feature.reader.labs.follow_me": false }, ["follow_me"])).toBe(false);
    expect(labEnabled("follow_me", { "feature.reader.labs.follow_me": true }, [])).toBe(true);
    expect(labEnabled("follow_me", { "feature.reader.labs.follow_me": "true" }, [])).toBe(false);
  });
});
