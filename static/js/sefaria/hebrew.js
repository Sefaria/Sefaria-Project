import Sefaria from './sefaria';
const GERESH = '\u05F3';
const GERSHAYIM = '\u05F4';
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
   * @returns {number[]} - Hebrew numeral
   */
  static breakIntMagnitudes(n, start=null) {
    /* Accepts an integer and an optional integer (multiple of 10) for at what order of
	magnitude to start breaking apart the integer.  If no option "start" is provided,
	function will determine the size of the input integer and start that the largest order
	of magnitude.
	Returns a big-endian list of the various orders of magnitude, by 10s, broken apart.

	breakIntMagnitudes(1129, 100)
	[1100, 20, 9]

	breakIntMagnitudes(2130)
	[2000, 100, 30, 0]

	breakIntMagnitudes(15000)
	[10000, 5000, 0, 0, 0]
     */
    if (!!start) {
      if (!(start % 10 === 0 || start === 1)) {
        throw new TypeError(`Argument 'start' must be 1 or divisible by 10, ${start} provided.`);
      }
    } else {
      start = Math.pow(10, Math.floor(Math.log10(n)));
    }

    if (start === 1) {
      return [n];
    } else {
      const thisIntMagnitude = Math.floor(n / start) * start;
      const nextIntMagnitude = this.breakIntMagnitudes(n - Math.floor(n / start) * start, start = Math.floor(start / 10));
      return [thisIntMagnitude].concat(nextIntMagnitude);
    }
  }
  static getChunks (list, chunkSize) {
    return list.reduce((all, one, i) => {
      const ch = Math.floor(i/chunkSize);
      all[ch] = [].concat((all[ch]||[]), one);
      return all
    }, [])
  }
  static sanitize (inputString, punctuation=true) {
    const replacementPairs = [
        [/\u05d9\u05d4/g, '\u05d8\u05d5'], //15
        [/\u05d9\u05d5/g, '\u05d8\u05d6'], //16
        [/\u05e8\u05e2\u05d4/g, '\u05e2\u05e8\u05d4'], //275
        [/\u05e8\u05e2\u05d1/g, '\u05e2\u05e8\u05d1'], //272
        [/\u05e8\u05e2/g, '\u05e2\u05e8'], //270
    ];

    replacementPairs.forEach(function(pair) {
        inputString = inputString.replace(pair[0], pair[1]);
    });

    if (punctuation) {
        // add gershayim at the end if longer than one character
        if (inputString.length > 1) {
            // if a geresh is not one of the last two items in the string
            if (this.right(inputString, 2).indexOf(GERESH) < 0) {
                inputString = inputString.substr(0, inputString.length - 1) + GERSHAYIM + this.right(inputString, 1);
            }
        } else {
            inputString += GERESH;
        }
    }

    return inputString;
  };
  static right(string, numChars) {
    'use strict';
    return string.slice(string.length - numChars);
  };
  static encodeLargeHebrewNumeral(n, punctuation=true) {
    // Break into magnitudes, then break into thousands buckets, big-endian
    let ret = this.breakIntMagnitudes(n).reverse();
    ret = this.getChunks(ret, 3);

    // Eliminate the orders of magnitude in preparation for being encoded
    ret = ret.map((arr, index) => {
       const sum = arr.reduce(function(a, b){
          return a + b;
      }, 0);
      return parseInt(sum * Math.pow(10, -3 * index));
    });

    // encode and join together, separating thousands with geresh
    ret = ret.map(x => this.tibetanNumeral(x));
    ret = ret.reverse().join(GERESH);
    ret = this.sanitize(ret, punctuation);
    return ret;
  }

  static tibetanNumberFromEngNumber(numberAsString) {
    switch (numberAsString) {
      case "0":
        return "༠";
      case "1":
        return "༡";
      case "2":
        return "༢";
      case "3":
        return "༣";
      case "4":
        return "༤";
      case "5":
        return "༥";
      case "6":
        return "༦";
      case "7":
        return "༧";
      case "8":
        return "༨";
      case "9":
        return "༩";
    }
  }

  static tibetanNumeral(num) {
    if (num < 10) {
      let tibNum = tibetanNumberFromEngNumber(num.toString());
      return '༠' + tibNum;

    }else {
      let tibetanTextArray = num
          .toString()
          .split("")
          .map(value => this.tibetanNumberFromEngNumber(value));
      return  tibetanTextArray.join("");
    }
  }


  static encodeHebrewNumeral(n, punctuation=true) {
    n = parseInt(n);
    if (n >= 1300) {
      return this.encodeLargeHebrewNumeral(n, punctuation=punctuation);
    }

    const values = this.hebrewNumerals;

    let heb = "";
    if (n >= 100) {
      const hundreds = n - (n % 100);
      heb += values[hundreds];
      n -= hundreds;
    }
    if (n === 15 || n === 16) {
      // Catch 15/16 no matter what the hundreds column says
      heb += values[n];
    } else {
      if (n >= 10) {
        const tens = n - (n % 10);
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
      return this.tibetanNumeral(n) + a;
    }
    else if (form === "long"){
      a = {a: 1, b: 2}[a];
      return this.tibetanNumeral(n) + " " + this.tibetanNumeral(a);
    }
  }

  /**
   * Encodes an English "Folio" (4 sided daf) ref address string into a corresponding Hebrew one.
   * @param {string} daf - The English folio string
   * @returns {string} - Hebrew representation
   */
  static encodeHebrewFolio(daf) {
    const n = parseInt(daf.slice(0,-1));
    let a = {a: "ཀ", b: "ཁ", c: "ག", d: "ང"}[daf.slice(-1)];
    return this.tibetanNumeral(n) + "," + a;
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
