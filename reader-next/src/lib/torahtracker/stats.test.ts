// @feature PRO-010
import { describe, expect, it } from "vitest";
import { arcCentroid, arcPath, categoryBars, donutSlices, niceMax, statsView, toShares, withOther, type SiteStats, type UserStats } from "./stats";

// Reference values are d3 5's (static/js/lib/d3.v5.min.js), compared on 2,000 random category sets while porting.
describe("Torah Tracker's numbers", () => {
  const site: SiteStats = { currently: { categoriesRead: { Tanakh: 10 } }, alltime: { categoriesRead: { Tanakh: 20 } } };
  const user = (textsRead: number): UserStats => ({ uid: 1, name: "A", currently: { textsRead, categoriesRead: { Tanakh: 3 }, mostViewedRefs: [] }, alltime: { textsRead: 9, categoriesRead: {}, mostViewedRefs: [] } });
  it("waits for both answers; a reader who read two texts or fewer sees the site's numbers", () => {
    expect(statsView(undefined, site, "currently")).toBeNull();
    expect(statsView(user(5), {}, "currently")).toBeNull();
    expect(statsView(user(5), site, "currently")!.active).toBe(true);
    expect(statsView(user(2), site, "currently")!.active).toBe(false);
    expect(statsView(user(2), site, "alltime")!.user.textsRead).toBe(9);
  });
  it("shares, and categories under 4% gathered into Etc", () => {
    expect(toShares({ a: 1, b: 3 })).toEqual({ a: 0.25, b: 0.75 });
    expect(withOther([{ name: "A", value: 97 }, { name: "B", value: 2 }, { name: "C", value: 1 }])).toEqual([{ name: "A", value: 97 }, { name: "Etc", value: 3 }]);
  });
  it("d3.pie: largest first from 12 o'clock, Etc last, the data's order kept", () => {
    const s = donutSlices({ Talmud: 30, Tanakh: 60, Midrash: 10 });
    expect(s.map((x) => x.name)).toEqual(["Talmud", "Tanakh", "Midrash", "Etc"]);
    expect(s[1]!.startAngle).toBe(0);
    expect(s[1]!.endAngle).toBeCloseTo(Math.PI * 1.2);
    expect(s[0]!.startAngle).toBeCloseTo(Math.PI * 1.2);
    expect(s[3]!.endAngle).toBeCloseTo(2 * Math.PI);
    // two categories: no Etc
    expect(donutSlices({ a: 1, b: 1 }).map((x) => x.name)).toEqual(["a", "b"]);
  });
  it("d3.arc's path and centroid", () => {
    expect(arcPath(130, 139, 0, Math.PI / 2)).toBe("M0,-139A139,139,0,0,1,139,0L130,0A130,130,0,0,0,0,-130Z");
    expect(arcPath(130, 139, 0, 0)).toBe("M0,-139L0,-130Z");
    const [x, y] = arcCentroid(105, 105, 0, Math.PI / 2);
    expect(x).toBeCloseTo(74.246);
    expect(y).toBeCloseTo(-74.246);
  });
  it("d3's nice() and band scale for the bars", () => {
    expect(niceMax(0.47)).toBe(0.5);
    expect(niceMax(0.83)).toBeCloseTo(0.9);
    const { height, bars } = categoryBars({ Tanakh: 6, Talmud: 3, Midrash: 1 }, { Tanakh: 1, Talmud: 1, Midrash: 2 });
    expect(height).toBe(20 + 75 * 3);
    expect(bars.map((b) => b.cat)).toEqual(["Tanakh", "Talmud", "Midrash"]);
    expect(bars.map((b) => b.y)).toEqual([21, 98, 175]);
    expect(bars[0]!.user).toBe(Math.round((0.6 / 0.7) * 660));
  });
});
