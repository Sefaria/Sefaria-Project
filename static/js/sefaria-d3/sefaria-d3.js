var d3 = require('d3');
var Sefaria = require('../sefaria/sefaria');


class SD3 {

    static talmudScale(direction, left_point, right_point, last_page) {
        // direction: "ltr" or "rtl"
        var rangePoints = direction == "ltr" ? [left_point, right_point] : [right_point, left_point];
        var domain = this.talmudBookDomain(last_page);

        return d3.scale.ordinal()
             .domain(domain)
            .rangePoints(rangePoints);
    }
    
    static integerScale(direction, left_point, right_point, chapters) {
        // direction: "ltr" or "rtl"
        var rangePoints = direction == "ltr" ? [left_point, right_point] : [right_point, left_point];
        var domain = this.integerBookDomain(chapters);
        
        return d3.scale.ordinal()
             .domain(domain)
            .rangePoints(rangePoints);
    }        
    

    static talmudBookDomain(last_page) {
        // last_page: a string of the form "45b"
        // Returns: list of amudim from 2a through last_page.
        // todo: Add sections? Perhaps with an optional shape parameter?

        var last_amud = last_page.slice(-1);
        var last_daf = last_page.slice(0, -1);

        var domain = [];
        for (var i = 2; i < last_daf; i++) {
            domain.push(i + "a");
            domain.push(i + "b");
        }
        domain.push(last_daf + "a");
        if (last_amud == "b") {
            domain.push(last_daf + "b")
        }
        return domain
    }
    
    static integerBookDomain(chap_lengths) {
        // Assumes depth 2, int:int.

        var domain = [];
        for (var i = 0; i < chap_lengths.length; ++i) {
            for (var j = 1; j <= chap_lengths[i]; ++j) {
                domain.push(i + 1 + ":" + j)
            }
        }
        return domain;
    }
    
    static talmudRefTicks(last_page, skip) {
        var last_amud = last_page.slice(-1);
        var last_daf = last_page.slice(0, -1);
        skip = skip || 5;

        var ticks = [];
        ticks.push("2a");
        for (var i = skip; i < last_daf - 2; i = i + skip) {
            ticks.push(i + "a");
        }
        if (last_amud == "a") {
            ticks.push(last_daf + "a");
        } else {
            ticks.push(last_daf + "b")
        }
        return ticks;
    }

    static integerRefTicks(chap_lengths, skip) {
        // Assumes depth 2.
        skip = skip || (chap_lengths.length < 40) ? 1 :
            (chap_lengths.length < 90) ? 2 :
                6;

        var ticks = [];
        for (var i = 1; i <= chap_lengths.length; i = i + skip) {
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
            "last_page": snode.address_class(-2).toStr("en", len(shape) + 1)
        }

 */