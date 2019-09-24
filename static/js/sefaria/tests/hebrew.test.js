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
        for (let i = 1; i < 1300; i++) {

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
            expect(a).toBe('ש');
        });

        it("can encode 33", function () {
            const a = Hebrew.encodeHebrewNumeral(33);
            expect(a).toBe("לג");
        });

    });

    describe("Basic encoding special cases", function () {
        it("can encode 275", function () {
            const a = Hebrew.encodeHebrewNumeral(275);
            expect(a).toBe("רעה");
        });

        it("can encode 270", function () {
            const a = Hebrew.encodeHebrewNumeral(270);
            expect(a).toBe("רע");
        });

        it("can encode 272", function () {
            const a = Hebrew.encodeHebrewNumeral(272);
            expect(a).toBe("רעב");
        });

        it("can encode 15", function () {
            const a = Hebrew.encodeHebrewNumeral(15);
            expect(a).toBe("טו");
        });

        it("can encode 16", function () {
            const a = Hebrew.encodeHebrewNumeral(16);
            expect(a).toBe("טז");
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

});
