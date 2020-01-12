#encoding=utf-8
import django
django.setup()
from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.helper.schema import refresh_version_state

def create_terms(titles, he_titles):
    for title, he_title in zip(titles, he_titles):
        title = " ".join(title.split(" ")[0:2])
        he_title = " ".join(he_title.split(" ")[0:2])
        term = Term()
        term.name = title
        term.add_primary_titles(title, he_title)
        try:
            print("Creating term {}".format(term.name))
            term.save()
        except InputError as e:
            print(e.message)

def change_collective_titles(titles, he_titles):
    for title, he_title in zip(titles, he_titles):
        index = library.get_index(title)
        index.collective_title = " ".join(title.split(" ")[0:2])
        print("Changing {}'s collective title to {}".format(title, index.collective_title))
        index.save()

def change_node_titles(title):
    index = library.get_index(title)
    for node in index.nodes.children:
        new_title = ""
        old_title = node.get_titles('en')[0]

        if "Mitzvot Ase" in old_title:
            new_title = old_title.replace("Mitzvot Ase", "Positive Commandments")
        elif "Mitzvot Lo Taase" in old_title:
            new_title = old_title.replace("Mitzvot Lo Taase", "Negative Commandments")
        if new_title == "Summary Positive Commandments":
            new_title = "Conclusion for Positive Commandments"

        #elif "Mitzvot" in old_title:
        #    new_title = old_title.replace("Mitzvot", "commandments")
        if new_title:
            print("Changing {} to {}".format(old_title, new_title))
            node.add_title(new_title, 'en', primary=True, replace_primary=True)
    index.save()


def change_base_title(base_title, new_base_title):
    index = library.get_index(base_title)
    index.set_title(new_base_title[0])
    index.set_title(new_base_title[1], lang='he')
    index.save()


def change_commentary_titles(titles, he_titles):
    #swap "al" for "on"
    for title, he_title in zip(titles, he_titles):
        index = library.get_index(title)
        new_title = title.replace(" al ", " on ").replace("Hamitzvot", "HaMitzvot")
        index.set_title(new_title)
        index.save()


def change_all_node_titles(book, new_structure):
    index = library.get_index(book)
    assert len(new_structure) == len(index.nodes.children)
    for new_title, node in zip(new_structure, index.nodes.children):
        en_title, he_title = new_title.split(" / ")
        he_title = he_title.decode('utf-8')
        if node.primary_title() != en_title:
            print("Changing {} to {}".format(node.primary_title(), en_title))
            node.add_title(en_title, 'en', True, True)
        if node.primary_title('he') != he_title:
            print("Changing {} to {}".format(node.primary_title('he'), he_title))
            node.add_title(he_title, 'he', True, True)
    index.save()


if __name__ == "__main__":
    titles = ['Kinaat Sofrim al Sefer Hamitzvot',
  'Marganita Tava al Sefer Hamitzvot',
 'Megilat Esther al Sefer Hamitzvot',
 'Hasagot HaRamban al Sefer HaMitzvot']
    he_titles = ["קנאת סופרים על ספר המצוות", "מרגניתא טבא על ספר המצוות", "מגילת אסתר על ספר המצוות",
                 """השגות הרמב"ן על ספר המצוות"""]

    # Create terms for three commentaries
    # Switch collective_titles to these terms
    create_terms(titles, he_titles)
    change_collective_titles(titles, he_titles)

    # Change base and commentary titles
    base_title = "Sefer HaMitzvot LaRambam"
    new_base_title = ["Sefer HaMitzvot", """ספר המצוות"""]
    change_base_title(base_title, new_base_title)
    change_commentary_titles(titles, he_titles)

    # Rename Mitzvot Aseh/Lo Aseh in base and Kinaat Sofrim
    change_node_titles("Sefer HaMitzvot")
    change_node_titles("Kinaat Sofrim on Sefer HaMitzvot")

    # Rename just about every node in Megilat Esther and Hasagot HaRamban
    new_structure = ["Introduction / הקדמה",
"Shorashim / שורשים",
"Positive Commandments / מצוות עשה",
"Positive Commandments Omitted by Rambam / שכחת העשין",
"Negative Commandments Omitted by Rambam / שכחת הלאוין",
"Conclusion / סיום"]
    change_all_node_titles("Megilat Esther on Sefer HaMitzvot", new_structure)
    new_structure = ["Introduction / הקדמה",
"Shorashim / שורשים",
"On the counting of Mitzvot / הקדמה לפרטי המצוות",
"Positive Commandments / מצוות עשה",
"Positive Commandments Omitted by Rambam / שכחת העשין",
"Negative Commandments / מצוות לא תעשה",
"Negative Commandments Omitted by Rambam / שכחת הלאוין",
"Conclusion / סיום"]
    change_all_node_titles("Hasagot HaRamban on Sefer HaMitzvot", new_structure)


    # Make Hasagot HaRamban into a commentary
    index = library.get_index("Hasagot HaRamban on Sefer HaMitzvot")
    index.dependence = "Commentary"
    index.base_text_titles = ["Sefer HaMitzvot"]
    index.collective_title = "Hasagot HaRamban"
    index.save()

    # Change commentaries' categories
    print("Moving texts out of Hasagot HaRamban category...")
    for title in titles:
        title = title.replace(" al ", " on ").replace("Hamitzvot", "HaMitzvot")
        index = library.get_index(title)
        index.categories = ["Halakhah", "Commentary"]
        index.save()

    print("Refreshing version states, cache, TOC, and deleting empty category Hasagot HaRamban...")
    for title in titles:
        title = title.replace(" al ", " on ").replace("Hamitzvot", "HaMitzvot")
        refresh_version_state(title)
    refresh_version_state("Sefer HaMitzvot")
    library.rebuild_toc()

    # need to run afterward --
    # c = Category().load({"lastPath": "Hasagot HaRamban al Sefer HaMitzvot"})
    # c.delete()





