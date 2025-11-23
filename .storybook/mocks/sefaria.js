import sefariaStub from "../sefariaStub.js";

if (typeof globalThis !== "undefined") {
  globalThis.Sefaria = globalThis.Sefaria || sefariaStub;
}

export default globalThis?.Sefaria ?? sefariaStub;
