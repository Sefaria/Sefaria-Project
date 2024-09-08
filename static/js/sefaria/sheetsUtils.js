import Sefaria from "./sefaria";

export async function getSegmentObjs(refs) {
    /*
    Given an array of ref-strings (could also be ranged refs),
    turn each ref to segment object and return an array of all segments
    */
    const segments = [];

    for (const ref of refs) {
      const text = await Sefaria.getText(ref, { stripItags: 1 });
      const newSegments = Sefaria.makeSegments(text, false);
      segments.push(...newSegments);
    }
    return segments;
}
export async function getNormalRef(ref) {
    /*
    Given a ref-string, get he and en normal ref-string
    */
    const refObj = await Sefaria.getRef(ref);
    return {en: refObj.ref, he: refObj.heRef}
}
function placedSegmentMapper(lang, segmented, includeNumbers, s) {
    /*
    Map each segment object to a formatted text string
    */
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
export const segmentsToSourceText = (segments, lan) => {
    /*
    Turn array of segment objects into one chunk of formatted text
    */
    const segmented = shouldBeSegmented(segments[0].ref);
    const includeNumbers = shouldIncludeSegmentNums(segments[0].ref);
    return(segments.map(placedSegmentMapper.bind(this, lan, segmented, includeNumbers))
    .filter(Boolean)
    .join(""));
}
function shouldIncludeSegmentNums(ref){
    /*
    Decide if segment of this ref should have segment numbers when turned into text chunk
    */
    const indexTitle = Sefaria.refIndexTitle(ref);
    const categories =  Sefaria.refCategories(ref);
    if (categories.includes("Talmud")) {return false}
    if (indexTitle === "Pesach Haggadah") {return false}
    if (categories === 1) {return false}
    return true;
}
function shouldBeSegmented(ref){
    /*
    Decide if segment of this ref should be followed by new line when turned into text chunk
    */
    const categories =  Sefaria.refCategories(ref);
    return !(categories[0] in {"Tanakh": 1, "Talmud": 1});
}