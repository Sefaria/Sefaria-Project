/* Testing done using Jest */
// Util.parashahHeader is reached via Sefaria.util rather than a direct `import Util`:
// util.js and sefaria.js are mutually circular, and importing util.js first throws
// during sefaria.js's module-level setup(). Importing Sefaria first resolves the cycle,
// and Sefaria.util === the Util class (sefaria.js: `Sefaria.util = Util`).
import Sefaria from '../sefaria';

const parashahHeader = Sefaria.util.parashahHeader;

// Fixtures modeled on the real Genesis / Parashat Bereshit data returned by
// /api/texts (verified against production):
//   - Genesis 1:1 is the Rishon: it starts the parasha (`whole`) AND, on this
//     branch, carries the aliyah + parasha metadata the reader needs.
//   - Genesis 2:4 starts the second aliyah mid-chapter: aliyah/parasha metadata
//     but no `whole` marker.
const genesis = { categories: ["Tanakh", "Torah"], alts: [{}], isDependant: false };

const rishonSegment = {
  alt: {
    whole: true,
    en: ["Bereshit"], he: ["בראשית"],
    aliyah_en: "First", aliyah_he: "ראשון",
    parasha_en: "Bereshit", parasha_he: "בראשית",
  },
};

const secondAliyahSegment = {
  alt: {
    en: ["Second"], he: ["שני"],
    aliyah_en: "Second", aliyah_he: "שני",
    parasha_en: "Bereshit", parasha_he: "בראשית",
  },
};

describe('Util.parashahHeader (Genesis / Parashat Bereshit)', () => {
  // Case 7
  it('aliyot OFF, parasha start: shows just the parasha name', () => {
    expect(parashahHeader(genesis, rishonSegment, false)).toEqual({
      en: "Bereshit",
      he: "בראשית",
      parashaTitle: true,
    });
  });

  // Case 8
  it('aliyot ON, the Rishon: renders as an aliyah header naming the parasha', () => {
    expect(parashahHeader(genesis, rishonSegment, true)).toEqual({
      en: "Bereshit: First",
      he: "בראשית: ראשון",
      parashaTitle: false,
    });
  });

  // Case 9
  it('aliyot ON, a mid-parasha aliyah: shows "<parasha>: <aliyah>"', () => {
    expect(parashahHeader(genesis, secondAliyahSegment, true)).toEqual({
      en: "Bereshit: Second",
      he: "בראשית: שני",
      parashaTitle: false,
    });
  });

  // Case 10
  it('aliyot OFF, a mid-parasha aliyah: shows no header', () => {
    expect(parashahHeader(genesis, secondAliyahSegment, false)).toBeNull();
  });
});
