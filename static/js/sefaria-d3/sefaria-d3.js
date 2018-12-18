var d3 = require('d3');
var Sefaria = require('sefaria');


class SD3 {

    static textScale(direction, left_point, right_point, shape, section_address_type) {
        /*  Returns a D3 scale object for the text described by shape

            direction: "ltr" or "rtl"
            left_point: The leftmost px value
            right_point:  The rightmost px value
            shape: an object describing the shape of the text available from the Shape API
            section_address_type: "talmud" or "integer"

        */
        var domain = this._textDomain(shape, section_address_type);
        return this._jaggedArrayScale(direction, left_point, right_point, domain);
    }

    static _jaggedArrayScale(direction, left_point, right_point, domain) {
        /*  Returns a D3 scale object covering the domain given in domain

            direction: "ltr" or "rtl"
            left_point: The leftmost px value
            right_point:  The rightmost px value
            domain:  an array of all of the valid address portions, as strings.
                this._jaggedArrayDomain is designed to output an array in this format.
        */
        var rangePoints = direction == "ltr" ? [left_point, right_point] : [right_point, left_point];

        return d3.scale.ordinal()
             .domain(domain)
            .rangePoints(rangePoints);
    }

    static _textDomain(shape, section_address_type) {
        if (shape.isComplex) {
            var domain = [];
            shape.chapters.map(sectionShape => {
                var sectionDomain = this._jaggedArrayDomain(sectionShape.chapters, section_address_type);
                sectionDomain = sectionDomain.map(i => sectionShape.title + " " + i );
                domain = domain.concat(sectionDomain);
            });
        } else {
            var domain = this._jaggedArrayDomain(shape.chapters, section_address_type);
            domain = domain.map(i => shape.book + " " + i );            
        }
        return domain;
    }

    static _jaggedArrayDomain(chap_lengths, section_address_type) {
        /*  Returns an array of all of the valid address portions, as strings.

            chap_lengths: An array of integers - the number of segments in each sequential sections
                These are available through `api/shape`.
            section_address_type: "talmud" or "integer"
         */

        var domain = [];
        var section;

        if (typeof chap_lengths == "number") {
            // Depth 1
            for (var i = 0; i < chap_lengths; ++i) {
                domain.push((i+1).toString());
            }
            return domain;
        }

        for (var i = 0; i < chap_lengths.length; ++i) {
            if (Array.isArray(chap_lengths[i])) {
                // Depth 3
                var sectionDomain = this._jaggedArrayDomain(chap_lengths[i], section_address_type);
                sectionDomain.map(sectionRef => domain.push(i+1 + ":" + sectionRef))
            } else {
                // Depth 2
                if (section_address_type == "talmud") {
                    section = Sefaria.hebrew.intToDaf(i);
                } else {
                    section = i+1;
                }
                if (chap_lengths[i] > 0) {
                    domain.push(section); // To support refs to sections e.g. "7b"
                }
                for (var j = 1; j <= chap_lengths[i]; ++j) {
                    domain.push(section + ":" + j)
                }
            }
        }
        return domain;
    }

    static scaleNormalizationFunction(scale) {
        /*
            Returns a function which works as a D3 scale function.

            The returned function behaves just as a D3 scale function, with the following addition:
            If no segment is given on input, adds ":1" to input and returns result.

            scale: the underlying D3 scale function
         */
        return function(i) {
            /* 
            if(i.indexOf(":") < 0) {
                i = i + ":1"; //Make chapter refs point to first verse
            }
            */
            if(i.indexOf("-") > -1) {
                i = i.split("-")[0]; // Make ranges point to start only
            }
            var res = scale(i);
            if (res == undefined) { console.log(i + " -> " + res); }
            return res;
        };
    }

    static talmudRefTicks(shape, skip) {
        /*  Returns an array of strings, in Talmud format, to be used as ticks on an Axis.

            shape: an object describing the shape of the text available from the Shape API
            skip: the number of segments to skip, between ticks
                If not provided, a default value will be chosen based on the number of segments
         */
        var domain = this._textDomain(shape, "talmud");
        skip = skip || parseInt(domain.length / 12);
        var ticks = domain.filter((e,i) => i % skip == 0);
        ticks = ticks.map(ref => ref.lastIndexOf(":") > -1 ? ref.slice(0, ref.lastIndexOf(":")) : ref);  

        return ticks;
    }

    static integerRefTicks(shape, skip) {
        /*  Returns an array of strings, in Integer:Integer format, to be used as ticks on an Axis.

            shape: an object describing the shape of the text available from the Shape API
            skip: the number of segments to skip, between ticks
                If not provided, a default value will be chosen based on the number of segments
         */
        var domain = this._textDomain(shape, "integer");
        skip = skip || parseInt(domain.length / 30);
        var ticks = domain.filter((e,i) => i % skip == 0);
        ticks = ticks.map(ref => ref.lastIndexOf(":") > -1 ? ref.slice(0, ref.lastIndexOf(":")) : ref);  

        return ticks;
    }

}

module.exports = SD3;

/*
Shape record:

        return {
            "section": snode.index.categories[-1],
            "heTitle": snode.primary_title("he"),
            "title": snode.primary_title("en"),
            "length": len(shape) if isinstance(shape, list) else 1,  # hmmmm
            "chapters": shape,
            "book": snode.index.title,
        }

 */
