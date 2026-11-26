import { describe, expect, it } from "vitest";
import { labEnabled, labKey, parseLabs } from "./labs";

describe("labs", () => {
  it("reads PUBLIC_LABS: known names only, blanks and spaces ignored", () => {
    expect(parseLabs(undefined)).toEqual([]);
    expect(parseLabs("")).toEqual([]);
    expect(parseLabs(" recording , follow_me,nope,")).toEqual(["follow_me", "recording"]);
    expect(parseLabs("social")).toEqual(["social"]);
    expect(parseLabs("social,labs_skin")).toEqual(["social", "labs_skin"]);
  });

  // @feature SHL-076
  it("is off by default", () => {
    expect(labEnabled("follow_me", undefined, undefined)).toBe(false);
    expect(labEnabled("social", undefined, undefined)).toBe(false);
    expect(labKey("social")).toBe("feature.reader.labs.social");
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

  // @feature SHL-080
  it("has a Labs skin lab, off by default and switched like the others", () => {
    expect(parseLabs("social,labs_skin")).toEqual(["social", "labs_skin"]);
    expect(labEnabled("labs_skin", undefined, undefined)).toBe(false);
    expect(labKey("labs_skin")).toBe("feature.reader.labs.labs_skin");
    expect(labEnabled("labs_skin", {}, ["labs_skin"])).toBe(true);
    expect(labEnabled("labs_skin", { "feature.reader.labs.labs_skin": false }, ["labs_skin"])).toBe(false);
  });
});
