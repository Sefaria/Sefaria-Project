from cauldron_links import *
def load_text(title, path):
    if os.path.exists(path):
        return json.load(open(path, 'r'))
    else:
        text = []
        for i in range(24):
            temp = get_text(f"{title} {i+1}", "en", versionTitle=vtitle, server=server)
            assert isinstance(temp, dict) and "text" in temp.keys(), temp
            text.append(temp["text"])
        json.dump(text, open(path, 'w'))
        return text

def check_texts(title1, title2_text):
    for i in range(24):
        if i % 5 == 0:      # dont need to check every perek
            title2_perek = title2_text[i]
            title1_perek = get_text(f"{title1} {i+1}", "en", versionTitle=vtitle, server=server)
            if title1_perek is None:
                print("GET request failed")
            else:
                title1_perek = title1_perek["text"]
                if title1_perek != title2_perek:
                    print("Difference at perek {i+1}")

if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("-k", "--key",
                        help="API Key")
    parser.add_argument("-s", "--server",
                        help="Sefaria server")
    parser.add_argument("-r", "--restore", help="1 or 0.  Restore cauldron to original condition. Delete anything posted in last run.", default=0)
    args = parser.parse_args()
    server = args.server
    key = args.key
    restore = True if args.restore == '1' else False
    samuel_path = "orig_samuel_text.json"
    joshua_path = "orig_joshua_text.json"
    vtitle = "Tanakh: The Holy Scriptures, published by JPS"

    # 1. if restore is True, first delete anything posted in last run and make sure this succeeded
    if restore:
        print("Restoring...")
        assert os.path.exists(joshua_path) and os.path.exists(samuel_path), "Didn't yet download Joshua and II Samuel.  Can't restore."
        orig_samuel_text = json.load(open(samuel_path, 'r'))
        orig_joshua_text = json.load(open(joshua_path, 'r'))
        send_text = {
            "language": "en",
            "versionTitle": vtitle,
            "versionSource": "https://www.sefaria.org",
            "text": orig_joshua_text
        }
        success = post_text("Joshua", send_text, server=server, API_KEY=key)
        if success is None:
            print("Restore failed.  Cauldron likely down.")
        check_texts("Joshua", orig_joshua_text)
        send_text = {
            "language": "en",
            "versionTitle": vtitle,
            "versionSource": "https://www.sefaria.org",
            "text": orig_samuel_text
        }
        success = post_text("II Samuel", send_text, server=server, API_KEY=key)
        if success is None:
            print("Restore failed.  Cauldron likely down.")
        check_texts("II Samuel", orig_samuel_text)


    # 2. replace Joshua with II Samuel's text.
    orig_samuel_text = load_text("II Samuel", samuel_path)
    orig_joshua_text = load_text("Joshua", joshua_path)
    send_text = {
        "language": "en",
        "versionTitle": vtitle,
        "versionSource": "https://www.sefaria.org",
        "text": orig_samuel_text
    }
    post_text("Joshua", send_text, server=server, API_KEY=key)
    print("https://ste.cauldron.sefaria.org/Joshua should now contain the text of II Samuel.")


    # 3. confirm Joshua is now II Samuel by checking some of the perakim
    check_texts("Joshua", orig_samuel_text)

    # 4. restore Joshua and confirm we restored it
    send_text = {
        "language": "en",
        "versionTitle": vtitle,
        "versionSource": "https://www.sefaria.org",
        "text": orig_joshua_text
    }
    post_text("Joshua", send_text, server=server, API_KEY=key)
    check_texts("Joshua", orig_joshua_text)
    print("https://ste.cauldron.sefaria.org/Joshua should now contain the text of Joshua.")
