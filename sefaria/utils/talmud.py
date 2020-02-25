from sefaria.utils.hebrew import encode_hebrew_numeral, encode_small_hebrew_numeral


#Overlapping with AddressTalmud.toString()
def section_to_daf(section, lang="en"):
    """
    Transforms a section number to its corresponding daf string,
    in English or in Hebrew.
    """
    section += 1
    daf = section // 2

    if lang == "en":
        if section > daf * 2:
            daf = "{}b".format(daf)
        else:
            daf = "{}a".format(daf)

    elif lang == "he":
        if section > daf * 2:
            daf = "{}{}".format(sanitize(encode_small_hebrew_numeral(daf), False) if daf < 1200 else encode_hebrew_numeral(daf, punctuation=False), ':')
        else:
            daf = "{}{}".format(sanitize(encode_small_hebrew_numeral(daf), False) if daf < 1200 else encode_hebrew_numeral(daf, punctuation=False), '.')

    return daf


def daf_to_section(daf):
    """
    Transforms a daf string (e.g., '4b') to its corresponding stored section number.
    """
    amud = daf[-1]
    daf = int(daf[:-1])
    section = daf * 2
    if amud == "a": section -= 1
    return section


def amud_ref_to_daf_ref(ref):
    """ Take an amud "a" reference and converts it to a daf reference """
    next = ref.next_section_ref()
    if next is None:
        return ref
    return ref.to(next)
