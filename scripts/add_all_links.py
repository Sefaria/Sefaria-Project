import django
django.setup()
from tqdm import tqdm
import argparse
from functools import partial
from sefaria.model import *
from sefaria.helper.link import add_links_from_text


count = 0


def add_links_for_segment(user_id, s, en_tref, he_tref, version):
    global count
    links = add_links_from_text(Ref(en_tref), version.language, s, version._id, user_id)
    count += len(links)


def add_links_for_version(version, user_id):
    version.walk_thru_contents(partial(add_links_for_segment, user_id))


def add_all_links(user_id, title=None):
    query = {} if title is None else {"title": title}
    version_set = VersionSet(query)
    for version in tqdm(version_set, total=version_set.count()):
        add_links_for_version(version, user_id)


def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("user_id", help="The user ID that will be associated with the links added")
    parser.add_argument("-t", "--title", dest="title", help="Optionally, the title of a specific work to add links to. Default will run on all indexes")
    return parser.parse_args()


if __name__ == '__main__':
    args = get_args()
    add_all_links(args.user_id, args.title)
    print(f"Total: {count}")
