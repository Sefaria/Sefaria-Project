var d3 = require('d3');
var Sefaria = require('../sefaria/sefaria');


class SD3 {

    static talmudScale(direction, left_point, right_point, chap_lengths) {
        // direction: "ltr" or "rtl"
        return this._jaggedArrayScale(direction, left_point, right_point, this._jaggedArrayDomain(chap_lengths, "talmud"));
    }
    
    static integerScale(direction, left_point, right_point, chap_lengths) {
        // direction: "ltr" or "rtl"
        return this._jaggedArrayScale(direction, left_point, right_point, this._jaggedArrayDomain(chap_lengths, "integer"));
    }        

    static _jaggedArrayScale(direction, left_point, right_point, domain) {
        // direction: "ltr" or "rtl"
        var rangePoints = direction == "ltr" ? [left_point, right_point] : [right_point, left_point];

        return d3.scale.ordinal()
             .domain(domain)
            .rangePoints(rangePoints);
    }

    static _jaggedArrayDomain(chap_lengths, section_address_type) {
        // section_address_type: "talmud" or "integer"
        var domain = [];
        var section;
        for (var i = 0; i < chap_lengths.length; ++i) {
            if (section_address_type == "talmud") {
                section = Sefaria.hebrew.intToDaf(i);
                if (chap_lengths[i] > 0) {
                    domain.push(section); // To support refs to e.g. "7b"
                }
            } else {
                section = i+1;
            }
            for (var j = 1; j <= chap_lengths[i]; ++j) {
                domain.push(section + ":" + j)
            }
        }
        return domain;
    }

    static scaleNormalizationFunction(scale) {
        return function(i) {
            if(i.indexOf(":") < 0) {
                i = i + ":1"; //Make chapter refs point to first verse
            }
            var res = scale(i);
            if (res == undefined) { console.log(i + " -> " + res); }
            return res;
        };
    }

    static talmudRefTicks(chap_lengths, skip) {
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
        // Assumes depth 2.
        var last_index = chap_lengths.length;
        skip = skip || (last_index < 40) ? 1 :
            (last_index < 90) ? 2 :
                6;

        var ticks = [];
        for (var i = 1; i <= last_index; i = i + skip) {
            ticks.push(i + ":1");
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