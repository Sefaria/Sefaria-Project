/********
 * Still some work to be done here,
 *   the numbers don't print right at all yet.
 *   encodeHebrewNumeral(3) === גגג׳
 *
 */


var GERESH = '\u05F3';
var GERSHAYIM = '\u05F4';

function right(string, numChars) {
    'use strict';
    return string.slice(string.length - numChars);
}

function enumerate(list) {

    return list.reduce(function(prevValue, curValue, index) {
        prevValue.push([index, curValue]);
        return prevValue;
    }, []);

}

function log10(val) {
    return Math.log(val) / Math.LN10;
}

function sum(list) {
    return list.reduce(function(prev, curr) {
        return prev + curr;
    }, 0);
}

// Bad idea?
Array.prototype.callOnMyself = function(callback) {
    return callback(this, arguments);
};

var hebToInt = function(unicodeChar) {
    'use strict';

    var hebrewNumerals = {
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

        // "\u05f3": "'", // Hebrew geresh
        // "\u05F4": '"', // Hebrew gershayim
    };

    if (hebrewNumerals.hasOwnProperty(unicodeChar)) {
        return hebrewNumerals[unicodeChar];
    } else {
        throw "Invalid Hebrew numeral character " + unicodeChar;
    }

};

var splitThousands = function(n, littleEndian) {

    // littleEndian defaults to true
    if (littleEndian === undefined) {
        littleEndian = true;
    }

    // Ignore geresh on digit < 10, if present

    if (right(n, 1) === GERESH) {
        n = n.slice(0, n.length - 1);
    }

    var re = new RegExp(GERESH, "g");

    var ret = n.replace(re, "'").split("'");
    if (!!littleEndian) {
        return ret.reverse();
    } else {
        return ret
    }

};

var hebStringToInt = function(n) {

    return n.replace(/[\u05F4\"]/g, '').split('')
                .map(function(a) {return hebToInt(a); })
                .reduce(function(a, b) { return a + b; }, 0);

};

var decodeHebrewNumeral = function(n) {

    return splitThousands(n).reduce(function(a, b) {
        a.push(hebStringToInt(b));
        return a;
    }, [])
    .callOnMyself(enumerate)
    .map(function(a) { return Math.pow(10, 3*a[0]) * a[1]; })
    .reduce(function(prev, curr) {
        return prev + curr;
    }, 0);

};


/******* ENCODING *********/

var chunks = function(l, n) {
    var out = [];
    for (var i = 0; i < l.length; i+=n) {
        out.push(l.slice(i, i + n))
    }

    return out;
};

var intToHeb = function(integer) {

    var hebrewNumerals = {
        0: "",
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
        15: "\u05D8\u05D5",  // Will not be hit when used with break_int_magnitudes
        16: "\u05D8\u05D6",  // Will not be hit when used with break_int_magnitudes
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
        400: "\u05EA"
    };

    // Fill in the hebrewNumerals mappings up to 1100
    for (var i = 500; i < 1200; i += 100) {
        hebrewNumerals[i] = Array(Math.floor(i / 400) + 1).join(hebrewNumerals[400]) + hebrewNumerals[i % 400];
    }

    if (integer > 1100) {
        throw "Asked to convert individual integer " + integer + " above 1100";
    } else if (!(integer in hebrewNumerals)) {
        throw "Asked to convert integer " + integer + " that lacks individual Hebrew character";
    } else {
        return hebrewNumerals[integer];
    }
};

var breakIntMagnitudes = function(n, start) {

    if (start === undefined) {
        start = Math.pow(10, Math.floor(log10(n)));
    } else if (!(start % 10 === 0 || start === 1)) {
        throw "Argument 'start' " + start + " must be 1 or divisible by 10";
    }

    if (start === 1) {
        return [n];
    } else {
        return [ Math.floor(n / start) * start ].concat(
            breakIntMagnitudes(n - Math.floor(n / start) * start, start / 10)
        );
    }

};

var sanitize = function(inputString, punctuation) {

    if (punctuation === undefined) {
        punctuation = true;
    }

    var replacementPairs = [
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
            if (right(inputString, 2).indexOf(GERESH) < 0) {
                inputString = inputString.substr(0, inputString.length - 1) + GERSHAYIM + right(inputString, 1);
            }
        } else {
            inputString += GERESH;
        }
    }

    return inputString;

};


var encodeSmallHebrewNumeral = function(n) {

    if (n >= 1200) {
        throw "Tried to encode small numeral " + n + " greater than 1200";
    } else {
        return breakIntMagnitudes(n, 100).reduce(function(prev, curr) {
            prev.push(intToHeb(curr));
            return prev;
        }, []).join('');
    }

};

var tibetanNumeral = function(num) {
    if (num < 10) {
        let tibNum = tibetanNumberFromEngNumber(num.toString());
        return '༠' + tibNum;

    }else {
        let tibetanTextArray = num
            .toString()
            .split("")
            .map(value => tibetanNumberFromEngNumber(value));
        return  tibetanTextArray.join("");
    }
}

function tibetanNumberFromEngNumber(numberAsString) {
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

var encodeHebrewNumeral = function(n, punctuation) {

    var ret;

    if (punctuation === undefined) {
        punctuation = true;
    }

    if ( n < 1200) {
        ret = encodeSmallHebrewNumeral(n);
    } else {
        ret = chunks(breakIntMagnitudes(n).reverse(), 3)
            .callOnMyself(enumerate)
            .map(function(a) { return Math.floor(sum(a[1])) * Math.pow(10, -3 * a[0]); })
            .reverse()
            .map(function(a) { return encodeSmallHebrewNumeral(a); })
            .join(GERESH);
    }

    return sanitize(ret, punctuation);

};