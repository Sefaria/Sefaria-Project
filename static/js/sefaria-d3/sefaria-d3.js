var d3 = require('d3');
var Sefaria = require('sefaria');


class SD3 {

    static talmudScale(direction, left_point, right_point, chap_lengths) {
        /*  Returns a D3 scale object for the Talmud:Integer addressed jagged array described by chap_lengths

            direction: "ltr" or "rtl"
            left_point: The leftmost px value
            right_point:  The rightmost px value
            chap_lengths: An array of integers - the number of segments in each sequential sections
                These are available through `api/shape`.
        */
        return this._jaggedArrayScale(direction, left_point, right_point, this._jaggedArrayDomain(chap_lengths, "talmud"));
    }

    static integerScale(direction, left_point, right_point, chap_lengths) {
        /*  Returns a D3 scale object for the Integer:Integer addressed jagged array described by chap_lengths

            direction: "ltr" or "rtl"
            left_point: The leftmost px value
            right_point:  The rightmost px value
            chap_lengths: An array of integers - the number of segments in each sequential sections
                These are available through `api/shape`.
        */
        return this._jaggedArrayScale(direction, left_point, right_point, this._jaggedArrayDomain(chap_lengths, "integer"));
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
            console.log(domain);
            return domain
        }

        for (var i = 0; i < chap_lengths.length; ++i) {
            if (section_address_type == "talmud") {
                section = Sefaria.hebrew.intToDaf(i);
            } else {
                section = i+1;
            }
            if (chap_lengths[i] > 0) {
                domain.push(section); // To support refs to e.g. "7b"
            }
            for (var j = 1; j <= chap_lengths[i]; ++j) {
                domain.push(section + ":" + j)
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

    static talmudRefTicks(chap_lengths, skip) {
        /*  Returns an array of strings, in Talmud format, to be used as ticks on an Axis.

            chap_lengths: An array of integers - the number of segments in each sequential sections
                These are available through `api/shape`.
            skip: the number of sections to skip, between ticks
                If not provided, a default value will be chosen based on the number of sections
         */
        var last_index = chap_lengths.length - 1;
        skip = skip || (last_index < 80) ? 4 :
            (last_index < 120) ? 6 :
                10;

        var ticks = [];
        ticks.push("2a");
        for (var i = skip + 2; i < last_index - 2; i = i + skip) {
            ticks.push(Sefaria.hebrew.intToDaf(i));
        }
        ticks.push(Sefaria.hebrew.intToDaf(last_index));

        return ticks;
    }

    static integerRefTicks(chap_lengths, skip) {
        /*  Returns an array of strings, in Integer:Integer format, to be used as ticks on an Axis.
            Assumes depth 2 (Would this work w/ Depth 3, as is?)

            chap_lengths: An array of integers - the number of segments in each sequential sections
                These are available through `api/shape`.
            skip: the number of sections to skip, between ticks
                If not provided, a default value will be chosen based on the number of sections
         */
        var isDepth1 = typeof chap_lengths == "number";
        var last_index = isDepth1 ? chap_lengths : chap_lengths.length;
        skip = skip || (last_index < 40) ? 1 :
            (last_index < 90) ? 2 :
                6;

        var ticks = [];
        for (var i = 1; i <= last_index; i = i + skip) {
            ticks.push(i);
        }
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
