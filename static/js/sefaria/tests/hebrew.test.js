/* Testing done using Jest */
const Hebrew = require('../hebrew');

const { encodeHebrewNumeral, decodeHebrewNumeral } = Hebrew;

describe("Sanity checks", function() {
    var a;
    var i;

    it("can encode without throwing errors", function() {

        for (i = 1; i < 5000; i++) {
            a = encodeHebrewNumeral(i);
            expect(a).toBeDefined();
        }

    });

    it("can encode and decode correctly", function() {
        for (i = 1; i < 5000; i++) {

            // if the number isn't 2/3/4000
            if ([2000, 3000, 4000].indexOf(i) === -1) {
                a = decodeHebrewNumeral(encodeHebrewNumeral(i));
                expect(a).toBe(i);
            }
        }
    });

});

describe("Specific in/out tests", function() {

    describe("Basic encoding tests", function () {
        var a;

        it("can encode 300", function () {
            a = encodeHebrewNumeral(300);
            expect(a).toBe('ש׳');
        });

        it("can encode 33 with punctuation flag", function () {
            a = encodeHebrewNumeral(33, true);
            expect(a).toBe("ל״ג");
        });

        it("can encode encode 5764", function () {
            a = encodeHebrewNumeral(5764);
            expect(a).toBe("ה׳תשס״ד");
        });

        it("can encode 1000005", function () {
            a = encodeHebrewNumeral(1000005);
            expect(a).toBe("א׳׳ה");
        });

    });

    describe("Basic encoding special cases", function () {
        var a;

        it("can encode 275", function () {
            a = encodeHebrewNumeral(275);
            expect(a).toBe("ער״ה");
        });

        it("can encode 270", function () {
            a = encodeHebrewNumeral(270);
            expect(a).toBe("ע״ר");
        });

        it("can encode 272", function () {
            a = encodeHebrewNumeral(272);
            expect(a).toBe("ער״ב");
        });

        it("can encode 15", function () {
            a = encodeHebrewNumeral(15);
            expect(a).toBe("ט״ו");
        });

        it("can encode 16", function () {
            a = encodeHebrewNumeral(16);
            expect(a).toBe("ט״ז");
        });
    });

    describe("Basic encoding without punctuation", function () {
        var a;

        it("can encode 35 without punctuation", function () {
            a = encodeHebrewNumeral(35, false);
            expect(a).toBe("לה");
        });

        it("can encode 42 without punctuation", function () {
            a = encodeHebrewNumeral(42, false);
            expect(a).toBe("מב");
        });

        it("can encode 129 without punctuation", function () {
            a = encodeHebrewNumeral(129, false);
            expect(a).toBe("קכט");
        });
    });

    describe("Basic decoding tests", function () {
        var a;

        it("can decode א", function () {
            a = decodeHebrewNumeral("א");
            expect(a).toBe(1);
        });

        it("can decode תתש", function () {
            a = decodeHebrewNumeral("תתש");
            expect(a).toBe(1100);
        });

        it("can decode תקט״ו", function () {
            a = decodeHebrewNumeral("תקט״ו");
            expect(a).toBe(515);
        });

        it("can decode ה׳תשס״ד", function () {
            a = decodeHebrewNumeral("ה׳תשס״ד");
            expect(a).toBe(5764);
        });

    });

    describe("undefined conventions", function () {
        var a;

        it("deals with 15000", function () {
            a = encodeHebrewNumeral(15000);
            expect(a).toBe("טו׳");
        });

        it("deals with 16000", function () {
            a = encodeHebrewNumeral(16000);
            expect(a).toBe("טז׳");
        });
    });

});
