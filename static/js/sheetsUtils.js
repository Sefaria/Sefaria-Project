import Sefaria from "./sefaria/sefaria";

export async function getSegmentObjs(refs) {
    const segments = [];

    for (const ref of refs) {
      const text = await Sefaria.getText(ref, { stripItags: 1 });
      const newSegments = Sefaria.makeSegments(text, false);
      segments.push(...newSegments);
    }
    return segments;
  }

export async function getNormalEnRef(ref) {
    const text = await Sefaria.getText(ref, { stripItags: 1 });
    return text.ref;
}
export async function getNormalHeRef(ref) {
    const text = await Sefaria.getText(ref, { stripItags: 1 });
    return text.heRef;
}

function placed_segment_mapper(lang, segmented, includeNumbers, s) {
    if (!s[lang]) {return ""}

    let numStr = "";
    if (includeNumbers) {
        const num = (lang=="he") ? Sefaria.hebrew.encodeHebrewNumeral(s.number) : s.number;
        numStr = "<small>(" + num + ")</small> ";
    }
    let str = "<span class='segment'>" + numStr + s[lang] + "</span> ";
    if (segmented) {
        str = "<p>" + str + "</p>";
    }
    str = str.replace(/(<br\/>)+/g, ' ')
    return str;
}
export function segmentsToSourceText(segments, lan, segmented, includeNumbers){
    return(segments.map(placed_segment_mapper.bind(this, lan, segmented, includeNumbers))
    .filter(Boolean)
    .join(""));
}
export function shouldIncludeSegmentNums(ref){
    const indexTitle = Sefaria.refIndexTitle(ref);
    const categories =  Sefaria.refCategories(ref);
    if (categories.indexOf("Talmud") !== -1) {return false}
    if (indexTitle === "Pesach Haggadah") {return false}
    if (categories === 1) {return false}
    return true;
}
export function shouldBeSegmented(ref){
    const categories =  Sefaria.refCategories(ref);
    return !(categories[0] in {"Tanakh": 1, "Talmud": 1});
}