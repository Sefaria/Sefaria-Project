/* Testing done using Jest */
import Hebrew from '../hebrew';


describe("Sanity checks", function() {

    it("can encode without throwing errors", function() {
        for (let i = 1; i < 5000; i++) {
            const a = Hebrew.encodeHebrewNumeral(i);
            expect(a).toBeDefined();
        }

    });

    it("can encode and decode correctly", function() {
        for (let i = 1; i < 5000; i++) {

            // if the number isn't 2/3/4000
            if ([2000, 3000, 4000].indexOf(i) === -1) {
                const a = Hebrew.decodeHebrewNumeral(Hebrew.encodeHebrewNumeral(i));
                expect(a).toBe(i);
            }
        }
    });

});

describe("Specific in/out tests", function() {

    describe("Basic encoding tests", function () {

        it("can encode 300", function () {
            const a = Hebrew.encodeHebrewNumeral(300);
            expect(a).toBe('ש׳');
        });

        it("can encode 33 with punctuation flag", function () {
            const a = Hebrew.encodeHebrewNumeral(33, true);
            expect(a).toBe("ל״ג");
        });

        it("can encode encode 5764", function () {
            const a = Hebrew.encodeHebrewNumeral(5764);
            expect(a).toBe("ה׳תשס״ד");
        });

        it("can encode 1000005", function () {
            const a = Hebrew.encodeHebrewNumeral(1000005);
            expect(a).toBe("א׳׳ה");
        });

    });

    describe("Basic encoding special cases", function () {
        it("can encode 275", function () {
            const a = Hebrew.encodeHebrewNumeral(275);
            expect(a).toBe("ער״ה");
        });

        it("can encode 270", function () {
            const a = Hebrew.encodeHebrewNumeral(270);
            expect(a).toBe("ע״ר");
        });

        it("can encode 272", function () {
            const a = Hebrew.encodeHebrewNumeral(272);
            expect(a).toBe("ער״ב");
        });

        it("can encode 15", function () {
            const a = Hebrew.encodeHebrewNumeral(15);
            expect(a).toBe("ט״ו");
        });

        it("can encode 16", function () {
            const a = Hebrew.encodeHebrewNumeral(16);
            expect(a).toBe("ט״ז");
        });
    });

    describe("Basic encoding without punctuation", function () {
        it("can encode 35 without punctuation", function () {
            const a = Hebrew.encodeHebrewNumeral(35, false);
            expect(a).toBe("לה");
        });

        it("can encode 42 without punctuation", function () {
            const a = Hebrew.encodeHebrewNumeral(42, false);
            expect(a).toBe("מב");
        });

        it("can encode 129 without punctuation", function () {
            const a = Hebrew.encodeHebrewNumeral(129, false);
            expect(a).toBe("קכט");
        });
    });

    describe("Basic decoding tests", function () {

        it("can decode א", function () {
            const a = Hebrew.decodeHebrewNumeral("א");
            expect(a).toBe(1);
        });

        it("can decode תתש", function () {
            const a = Hebrew.decodeHebrewNumeral("תתש");
            expect(a).toBe(1100);
        });

        it("can decode תקט״ו", function () {
            const a = Hebrew.decodeHebrewNumeral("תקט״ו");
            expect(a).toBe(515);
        });

        it("can decode ה׳תשס״ד", function () {
            const a = Hebrew.decodeHebrewNumeral("ה׳תשס״ד");
            expect(a).toBe(5764);
        });

    });

    describe("undefined conventions", function () {

        it("deals with 15000", function () {
            const a = Hebrew.encodeHebrewNumeral(15000);
            expect(a).toBe("טו׳");
        });

        it("deals with 16000", function () {
            const a = Hebrew.encodeHebrewNumeral(16000);
            expect(a).toBe("טז׳");
        });
    });

});
