from sefaria.model import *
from sefaria.system.exceptions import BookNameError


if __name__ == "__main__":
    def func(title):
        try:
            library.get_index("Rash MiShantz on "+title)
            return True
        except BookNameError:
            return False


    relevantBooks = list(filter(func, library.get_indexes_in_category("Mishnah")))
    for eachBook in relevantBooks:
        allRefs = [ref.normal() for ref in library.get_index(eachBook).all_segment_refs()]
        for eachRef in allRefs:
            eachRef = "Rash MiShantz on "+eachRef
            if Ref(eachRef).text('he').text == []:
                print(eachRef)

    middot = library.get_index("Mishnah Middot")
    allRefs = [ref.normal() for ref in middot.all_segment_refs()]
    for eachRef in allRefs:
        eachRef = "R' Shemaiah on "+eachRef
        if Ref(eachRef).text('he').text == []:
            print(eachRef)