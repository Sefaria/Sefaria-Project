import django
django.setup()
from sefaria.model import *
count = 0
changed = []
i = library.get_index("Rashi on Bereshit Rabbah")
i.nodes.add_title('רש"י על בראשית רבה', 'he', True, True)
i.save()
for i in IndexSet({"is_cited": True}):
    change = False
    primary_title = i.get_title('he').replace('״', '"').replace('”', '"')
    i.nodes.add_title(primary_title, 'he', True, True)
    index_titles = [primary_title]
    for title in i.schema["titles"]:
        if title["lang"] == "he" and title.get("primary", False) is False:
            index_titles.append(title["text"])

    for title in index_titles:
        title = title.replace('״', '"').replace('”', '"')
        new_titles = [title] + Index.get_title_quotations_variants(title)
        for new_title in new_titles:
            if new_title not in index_titles:
                i.nodes.add_title(new_title, 'he')
                change = True

    for node in i.nodes.children:
        if getattr(node, "default", False) is False and getattr(node, "sharedTitle", "") == "":
            primary_title = node.get_primary_title('he')
            primary_title = primary_title.replace('״', '"').replace('”', '"')
            node.add_title(primary_title, 'he', True, True)
            node_titles = node.get_titles('he')
            for node_title in node_titles:
                node_title = node_title.replace('״', '"').replace('”', '"')
                new_titles = [node_title] + Index.get_title_quotations_variants(node_title)
                for new_title in new_titles:
                    if new_title not in node_titles:
                        change = True
                        node.add_title(new_title, 'he')
    count += 1
    if count % 100 == 0:
        print(count)

    if change == True:
        changed.append(i.title)
        i.save()

print("***********")
print(changed)