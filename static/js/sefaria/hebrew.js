import Sefaria from './sefaria';

class Hebrew {
  static decodeHebrewNumeral(h) {
    // Takes a string representing a Hebrew numeral and returns it integer value.
    var values = this.hebrewNumerals;

    if (h === values[15] || h === values[16]) {
      return values[h];
    }

    var n = 0;
    for (let i = 0; i < h.length; i++) {
      n += values[h.charAt(i)];
    }

    return n;
  }
  
  /**
   * Encodes an integer "Daf" and returns a string encoding it as a Hebrew numeral.
   * @param {number} n - The integer
   * @returns {string} - Hebrew numeral
   */
  static encodeHebrewNumeral(n) {
    n = parseInt(n);
    if (n >= 1300) {
      return n;
    }

    var values = this.hebrewNumerals;

    var heb = "";
    if (n >= 100) {
      var hundreds = n - (n % 100);
      heb += values[hundreds];
      n -= hundreds;
    }
    if (n === 15 || n === 16) {
      // Catch 15/16 no matter what the hundreds column says
      heb += values[n];
    } else {
      if (n >= 10) {
        var tens = n - (n % 10);
        heb += values[tens];
        n -= tens;
      }
      if (n > 0) {
        if (!values[n]) {
            return undefined
        }
        heb += values[n];
      }
    }
    return heb;
  }
  
  /**
   * Encodes an English "Daf" (2 sided page) ref address string into a corresponding Hebrew one.
   * @param {string} daf - The English daf string
   * @param {string} form - Whether to use colon or letters
   * @returns {string} - Hebrew representation
   */
  static encodeHebrewDaf(daf, form) {
    // Returns Hebrew daf strings from "32b"
    form = form || "short";
    const n = parseInt(daf.slice(0,-1));
    let a = daf.slice(-1);
    if (form === "short") {
      a = {a: ".", b: ":"}[a];
      return this.encodeHebrewNumeral(n) + a;
    }
    else if (form === "long"){
      a = {a: 1, b: 2}[a];
      return this.encodeHebrewNumeral(n) + " " + this.encodeHebrewNumeral(a);
    }
  }

  /**
   * Encodes an English "Folio" (4 sided daf) ref address string into a corresponding Hebrew one.
   * @param {string} daf - The English folio string
   * @returns {string} - Hebrew representation
   */
  static encodeHebrewFolio(daf) {
    const n = parseInt(daf.slice(0,-1));
    let a = {a: "א", b: "ב", c: "ג", d: "ד"}[daf.slice(-1)];
    return this.encodeHebrewNumeral(n) + "," + a;
  }
  static getNikkudRegex(rawString) {
    // given a Hebrew string, return regex that allows for arbitrary nikkud in between letters
    return rawString.stripNikkud().split("").join("[\u0591-\u05C7]*");
  }
  static isHebrew(text) {
    // Returns true if text is (mostly) Hebrew
    // Examines up to the first 200 characters, ignoring html tags, punctuation and numbers
    text = text.stripHtml().stripNikkud();
    let heCount = 0;
    let enCount = 0;
    const punctuationRE = /[0-9 .,'"?!;:\-=@#$%^&*()/<>]/;

    for (let i = 0; i < Math.min(200, text.length); i++) {
      if (punctuationRE.test(text[i])) { continue; }
      if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
        heCount++;
      } else {
        enCount++;
      }
    }
    return (heCount > enCount);
  }
  static containsHebrew(text) {
    // Returns true if there are any Hebrew characters in text
    for (let i = 0; i < text.length; i++) {
      if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
        return true;
      }
    }
    return false;
  }

  static containsEnglish(text) {
    // Returns true if there are any English characters in text
    return !!(text.match(/[a-zA-Z]/));
  }

  static hebrewPlural(s) {
    const known = {
      "Daf":      "Dappim",
      "Mitzvah":  "Mitzvot",
      "Mitsva":   "Mitzvot",
      "Mesechet": "Mesechtot",
      "Perek":    "Perokim",
      "Siman":    "Simanim",
      "Seif":     "Seifim",
      "Se'if":    "Se'ifim",
      "Mishnah":  "Mishnayot",
      "Mishna":   "Mishnayot",
      "Chelek":   "Chelekim",
      "Parasha":  "Parshiot",
      "Parsha":   "Parshiot",
      "Pasuk":    "Psukim",
      "Midrash":  "Midrashim",
      "Aliyah":   "Aliyot"
    };

    return (s in known ? known[s] : s + "s");
  }

  /**
   * Takes an integer representing a database addressable location and converts it into the appropriate 2 sided Talmud page address. 
   * For Reverse function see below dafToInt()
   * @param {number} i - The integer physical location
   * @returns {string} The Daf X[a/b] notation, e.g. Daf 15b
   */
  static intToDaf(i) {
    // Base 0 int -> daf
    // e.g. 2 -> "2a"
    i += 1;
    const daf = Math.ceil(i/2);
    return daf + (i%2 ? "a" : "b");
  }
  
  /**
   * Takes a Talmud daf string and turns it into the correct db addressable physical location for that text. The reverse of the above intToDaf()
   * @param {string} daf - The input string
   * @returns {number} The actual integer location of the text
   */
  static dafToInt(daf) {
    var amud = daf.slice(-1);
    var i = parseInt(daf.slice(0, -1)) - 1;
    i = amud == "a" ? i * 2 : i*2 +1;
    return i;
  }
  
  /**
   * Takes an integer representing a database addressable location and converts it into the appropriate 4 sided Jerusalem Talmud like manuscript page address
   * @param {number} i - The integer physical location
   * @returns {string} The Daf X[a-d] notation, e.g. Daf 4c
   */
  static intToFolio(i) {
    i += 1;
    const daf = Math.ceil(i/4);
    const mod = i%4;
    return daf + (mod === 1 ? "a" : mod === 2 ? "b" : mod === 3 ? "c" : "d");
  }
  
}

Hebrew.hebrewNumerals = {
  "\u05D0": 1,
  "\u05D1": 2,
  "\u05D2": 3,
  "\u05D3": 4,
  "\u05D4": 5,
  "\u05D5": 6,
  "\u05D6": 7,
  "\u05D7": 8,
  "\u05D8": 9,
  "\u05D9": 10,
  "\u05D8\u05D5": 15,
  "\u05D8\u05D6": 16,
  "\u05DB": 20,
  "\u05DC": 30,
  "\u05DE": 40,
  "\u05E0": 50,
  "\u05E1": 60,
  "\u05E2": 70,
  "\u05E4": 80,
  "\u05E6": 90,
  "\u05E7": 100,
  "\u05E8": 200,
  "\u05E9": 300,
  "\u05EA": 400,
  "\u05EA\u05E7": 500,
  "\u05EA\u05E8": 600,
  "\u05EA\u05E9": 700,
  "\u05EA\u05EA": 800,
  1: "\u05D0",
  2: "\u05D1",
  3: "\u05D2",
  4: "\u05D3",
  5: "\u05D4",
  6: "\u05D5",
  7: "\u05D6",
  8: "\u05D7",
  9: "\u05D8",
  10: "\u05D9",
  15: "\u05D8\u05D5",
  16: "\u05D8\u05D6",
  20: "\u05DB",
  30: "\u05DC",
  40: "\u05DE",
  50: "\u05E0",
  60: "\u05E1",
  70: "\u05E2",
  80: "\u05E4",
  90: "\u05E6",
  100: "\u05E7",
  200: "\u05E8",
  300: "\u05E9",
  400: "\u05EA",
  500: "\u05EA\u05E7",
  600: "\u05EA\u05E8",
  700: "\u05EA\u05E9",
  800: "\u05EA\u05EA",
  900: "\u05EA\u05EA\u05E7",
  1000: "\u05EA\u05EA\u05E8",
  1100: "\u05EA\u05EA\u05E9",
  1200: "\u05EA\u05EA\u05EA"
};

export default Hebrew;
