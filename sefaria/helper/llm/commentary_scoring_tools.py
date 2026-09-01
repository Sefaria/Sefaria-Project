from sefaria.model import Ref


def parse_link_for_base(link):
    """
    Return Commentary and quoted Ref
    """
    # Parse both sides
    r0, r1 = Ref(link['refs'][0]), Ref(link['refs'][1])
    if link["type"].lower() == "commentary":
        return None

    # Identify which side is commentary and which is the base-text "anchor"
    if r0.primary_category == "Commentary" and r1.primary_category != "Commentary":
        return r0.normal(), r1.normal()
    elif r1.primary_category == "Commentary" and r0.primary_category != "Commentary":
        return r1.normal(), r0.normal()
    else:
        return None