from sefaria.utils.tibetan import int_to_tib


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
            daf = "{}ཁ".format(int_to_tib(daf))
        else:
            daf = "{}ཀ".format(int_to_tib(daf))
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
