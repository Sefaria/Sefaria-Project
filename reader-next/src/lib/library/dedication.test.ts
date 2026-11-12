import { describe, expect, it } from "vitest";
import { dedicationDate, parseDedications } from "./dedication";

const SHEET = `/*O_o*/
google.visualization.Query.setResponse({"version":"0.6","status":"ok","table":{"cols":[{"id":"A","label":"Date","type":"date"},{"id":"B","label":"English","type":"string"},{"id":"C","label":"Hebrew","type":"string"}],"rows":[{"c":[{"v":"Date(2026,10,10)","f":"2026-11-10"},null,{"v":null}]},{"c":[{"v":"Date(2026,10,11)","f":"2026-11-11"},{"v":"Dedicated by *the Cohen family*"},{"v":"הוקדש"}]}]}});`;

describe("the daily dedication", () => {
  it("reads the sheet's rows by their formatted date (the answer recorded 2026-11-10, with a text added to the second row)", () => {
    expect(parseDedications(SHEET)).toEqual({ "2026-11-10": { en: undefined, he: undefined }, "2026-11-11": { en: "Dedicated by *the Cohen family*", he: "הוקדש" } });
    expect(parseDedications("not json")).toEqual({});
  });
  it("the day turns at 6 pm local time", () => {
    expect(dedicationDate(new Date(2026, 10, 10, 17, 59))).toBe("2026-11-10");
    expect(dedicationDate(new Date(2026, 10, 10, 18, 0))).toBe("2026-11-11");
  });
});
