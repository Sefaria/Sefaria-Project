from cauldron_links import *
if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("-k", "--key",
                        help="API Key")
    parser.add_argument("-d", "--destination",
                        help="Sefaria server")
    args = parser.parse_args()
    server = args.destination
    key = args.key

    # 1. replace Joshua with II Samuel's text.  first store Joshua so we can put it back after
    vtitle = "Tanakh: The Holy Scriptures, published by JPS"
    orig_joshua_text = TextChunk(Ref("Joshua"), vtitle=vtitle).text
    orig_joshua_perek_1 = get_text("Joshua 1", "en", versionTitle=vtitle, server=server)["text"]
    orig_samuel_perek_1 = get_text("II Samuel 1", "en", versionTitle=vtitle, server=server)["text"]
    samuel_text = TextChunk(Ref("II Samuel"), vtitle=vtitle).text
    send_text = {
        "language": "en",
        "versionTitle": vtitle,
        "versionSource": "https://www.sefaria.org",
        "text": samuel_text
    }

    post_text("Joshua", send_text, server=server, API_KEY=key)

    # 2. confirm Joshua 1 is now II Samuel 1
    new_joshua_perek_1 = get_text("Joshua 1", "en", versionTitle=vtitle, server=server)["text"]
    print(f"Expecting {server} II Samuel 1 to be identical with Joshua 1...")
    check_perakim(new_joshua_perek_1, orig_samuel_perek_1)


    # 3. restore Joshua and confirm we restored it
    send_text = {
        "language": "en",
        "versionTitle": vtitle,
        "versionSource": "https://www.sefaria.org",
        "text": orig_joshua_text
    }
    post_text("Joshua", send_text, server=server, API_KEY=key)
    restored_joshua_perek_1 = get_text("Joshua 1", "en", versionTitle=vtitle, server=server)["text"]
    print(f"Expecting {server} Joshua 1 to be restored to original...")
    check_perakim(restored_joshua_perek_1, orig_joshua_perek_1)

