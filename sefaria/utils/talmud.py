from sefaria.utils.hebrew import encode_hebrew_numeral, encode_small_hebrew_numeral


#Overlapping with AddressTalmud.toString()
def section_to_daf(section, lang="en"):
    """
    Transforms a section number to its corresponding daf string,
    in English or in Hebrew.
    """
    section += 1
    daf = section / 2

    if lang == "en":
        if section > daf * 2:
            daf = u"{}b".format(daf)
        else:
            daf = u"{}a".format(daf)

    elif lang == "he":
        if section > daf * 2:
            daf = u"{}{}".format(encode_small_hebrew_numeral(daf) if daf < 1200 else encode_hebrew_numeral(daf, punctuation=False), ':')
        else:
            daf = u"{}{}".format(encode_small_hebrew_numeral(daf) if daf < 1200 else encode_hebrew_numeral(daf, punctuation=False), '.')

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

