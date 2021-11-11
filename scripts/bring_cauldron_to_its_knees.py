import django
django.setup()
import json
import requests
import codecs
import argparse
from sefaria.model import *
from tqdm import tqdm


def delete_link(id_or_ref, server="", API_KEY="", VERBOSE=False):
    id_or_ref = id_or_ref.replace(" ", "_")
    url = server + "/api/links/{}".format(id_or_ref)
    result = http_request(url, body={'apikey': API_KEY}, json_payload=url, method="DELETE")
    if VERBOSE:
        print(result)
    return result

def post_link(info, server="", API_KEY="", skip_lang_check=True, VERBOSE=False, method="POST", dump_json=False):
    if dump_json:
        with open('links_dump.json', 'w') as fp:
            json.dump(info, fp)
    url = server+'/api/links/' if not skip_lang_check else server+"/api/links/?skip_lang_check=1"
    result = http_request(url, body={'apikey': API_KEY}, json_payload=info, method=method)
    if VERBOSE:
        print(result)
    return result


def http_request(url, params=None, body=None, json_payload=None, method="GET"):
    if params is None:
        params = {}
    if body is None:
        body = {}
    if json_payload:
        body['json'] = json.dumps(json_payload)  # Adds the json as a url parameter - otherwise json gets lost

    if method == "GET":
        response = requests.get(url)
    elif method == "POST":
        response = requests.post(url, params=params, data=body)
    elif method == "DELETE":
        response = requests.delete(url, params=params, data=body)
    else:
        raise ValueError("Cannot handle HTTP request method {}".format(method))

    success = True
    try:
        json_response = response.json()
        if isinstance(json_response, dict) and json_response.get("error"):
            success = False
            print("Error: {}".format(json_response["error"]))
    except ValueError:
        success = False
        json_response = ''
        with codecs.open('errors.html', 'w', 'utf-8') as outfile:
            outfile.write(response.text)

    if success:
        print("\033[92m{} request to {} successful\033[0m".format(method, url))
        return json_response
    else:
        print("\033[91m{} request to {} failed\033[0m".format(method, url))
        return response.text


def get_links(ref, server="http://www.sefaria.org"):
    ref = ref.replace(" ", "_")
    url = server+'/api/links/'+ref+"?skip_lang_check=1"
    return http_request(url)


def get_text(ref, lang="", versionTitle="", server="http://draft.sefaria.org"):
    ref = ref.replace(" ", "_")
    versionTitle = versionTitle.replace(" ", "_")
    url = '{}/api/texts/{}'.format(server, ref)
    if lang and versionTitle:
        url += "/{}/{}".format(lang, versionTitle)
    return http_request(url)


def post_text(ref, text, index_count="off", skip_links=False, server="", API_KEY="", dump_json=False):
    """
    :param ref:
    :param text:
    :param index_count:
    :param skip_links:
    :param server:
    :return:`
    """
    if dump_json:
        with open('text_dump.json', 'w') as fp:
            json.dump(text, fp)
    ref = ref.replace(" ", "_")
    url = server+'/api/texts/'+ref
    params, body = {}, {'apikey': API_KEY}
    if 'status' not in params:
        params['status'] = 'locked'
    if index_count == "on":
        params['count_after'] = 1
    if skip_links:
        params['skip_links'] = True
    return http_request(url, params=params, body=body, json_payload=text, method="POST")


def post_link_in_steps(links, step=0, API_KEY="", server=""):
    if step == 0:
        post_link(links, server=server, API_KEY=API_KEY)
    else:
        pos = 0
        for i in range(0, len(links), step):
            post_link(links[pos:pos+step], server=server, API_KEY=API_KEY)
            pos += step


def check_perakim(perek1, perek2):
    differences = 0
    for i, line in enumerate(perek1):
        if line != perek2[i]:
            print(f"Difference at line {i}...")
            differences += 1
    if differences == 0:
        print("No differences found!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-k", "--key",
                        help="API Key")
    parser.add_argument("-d", "--destination",
                        help="Sefaria server")
    parser.add_argument("-q", "--quantity", default=0, help="Amount of links to post in each post.")
    args = parser.parse_args()
    server = args.destination
    key = args.key
    quantity = int(args.quantity)

    # 1. create additional links for II Samuel based on current Joshua links
    orig_II_Samuel_links = get_links("II Samuel", server=server)
    Joshua_links = get_links("Joshua", server=server)
    additional_II_Samuel_links = []
    for i, l in tqdm(enumerate(Joshua_links)):
        if "II Samuel" not in l["ref"]:
            l["anchorRef"] = l["anchorRef"].replace("Joshua", "II Samuel")
            additional_II_Samuel_links.append({"refs": [l["ref"], l["anchorRef"]], "auto": True, "generated_by": "chaos script", "type": "Commentary"})

    # 2. post additional II Samuel links and then make sure we successfully posted
    post_link_in_steps(additional_II_Samuel_links, step=quantity, API_KEY=key, server=server)
    current_II_Samuel_links = get_links("II Samuel", server=server)
    found = {str(sorted([l["ref"], l["anchorRef"]])) for l in current_II_Samuel_links}
    orig_II_Samuel_links = {str(sorted([l["ref"], l["anchorRef"]])) for l in orig_II_Samuel_links}
    additional_II_Samuel_links = {str(sorted(l["refs"])) for l in additional_II_Samuel_links}
    expecting = additional_II_Samuel_links.union(orig_II_Samuel_links)
    print(f"Finding {len(found)} on {server} and expecting {len(expecting)}")

    # 3. clean up server.  delete all links in II Samuel and then post local II Samuel links. finally confirm they're back
    delete_link("II Samuel", API_KEY=key, server=server)
    for i, l in tqdm(enumerate(orig_II_Samuel_links)):
        orig_II_Samuel_links[i] = {"refs": [l["ref"], l["anchorRef"]], "auto": True, "generated_by": "chaos script", "type": "Commentary"}
    post_link_in_steps(orig_II_Samuel_links, API_KEY=key, server=server)
    final_II_Samuel_links = get_links("II Samuel", server=server)
    print(f"Finding {len(final_II_Samuel_links)} and expecting {len(orig_II_Samuel_links)} on {server}")



    # 4. replace Joshua with II Samuel's text.  first store Joshua so we can put it back after
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

    # 5. confirm Joshua 1 is now II Samuel 1
    new_joshua_perek_1 = get_text("Joshua 1", "en", versionTitle=vtitle, server=server)["text"]
    print(f"Expecting {server} II Samuel 1 to be identical with Joshua 1...")
    check_perakim(new_joshua_perek_1, orig_samuel_perek_1)


    # 6. restore Joshua and confirm we restored it
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


from datetime import datetime
for webpage in tqdm(WebPageSet()):
    if datetime.now().min == webpage.lastUpdated:  # if webpage.lastUpdated is the birth of that guy from Bethlehem
        webpage.lastUpdated = webpage._id.generation_time.replace(tzinfo=None)
        try:
            webpage.save()
        except:
            print("Couldn't save {}".format(webpage.url))