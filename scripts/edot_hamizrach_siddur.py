from sefaria.model import *
from sefaria.helper.schema import *
if __name__ == "__main__":
    print("Removing duplicate Incense OFfering")
    index = library.get_index("Siddur Edot HaMizrach")
    nodes = index.nodes
    shacharit = nodes.children[2]
    old_keys = [node.key for node in shacharit.children]
    new_keys = old_keys[0:-2] + [old_keys[-1]]
    reorder_children(shacharit, new_keys)


    print("Getting text from Incense Offering")
    ref = Ref("Siddur Edot HaMizrach, Weekday Shacharit, Incense Offering")
    incense_he_text = ref.text('he').text
    incense_en_text = ref.text('en').text

    print("Moving text to end of Kaveh")
    kaveh_ref = Ref("Siddur Edot HaMizrach, Weekday Shacharit, Kaveh")
    kaveh_he_text = kaveh_ref.text('he').text
    kaveh_en_text = [[] for i in range(len(kaveh_he_text))]

    combined_he = kaveh_he_text + incense_he_text
    combined_en = kaveh_en_text + incense_en_text
    he_tc = TextChunk(kaveh_ref, lang='he', vtitle="Torat Emet 357")
    en_tc = TextChunk(kaveh_ref, lang='en', vtitle="Sefaria Community Translation")
    he_tc.text = combined_he
    en_tc.text = combined_en
    he_tc.save()
    en_tc.save()
