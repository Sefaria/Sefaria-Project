import json
import requests
import argparse
from tqdm import tqdm
import os.path


def delete_link(id_or_ref, server="", API_KEY="", VERBOSE=False):
    id_or_ref = id_or_ref.replace(" ", "_")
    url = server + "/api/links/{}".format(id_or_ref)
    result = http_request(url, body={'apikey': API_KEY}, json_payload=url, method="DELETE")
    if VERBOSE:
        print(result)
    return result

def post_link(info, server="", API_KEY="", skip_lang_check=True, VERBOSE=False, method="POST", dump_json=False):
    print(f"Attempting to post a total of {len(info)} links...")
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

    if success:
        print("\033[92m{} request to {} successful\033[0m".format(method, url))
        return json_response
    else:
        print(response.text)
        print("\033[91m{} request to {} failed\033[0m".format(method, url))
        return None

def get_links(ref, server="", msg=False):
    ref = ref.replace(" ", "_")
    url = server+'/api/links/'+ref+"?skip_lang_check=1"
    results = http_request(url)
    if msg:
        print(f"Found {len(results)} for {ref} on server {server}.")
    if isinstance(results, list):
        return results
    else:
        return []


def get_text(ref, lang="", versionTitle="", server="http://draft.sefaria.org"):
    ref = ref.replace(" ", "_")
    versionTitle = versionTitle.replace(" ", "_")
    url = '{}/api/texts/{}'.format(server, ref)
    if lang and versionTitle:
        url += "/{}/{}".format(lang, versionTitle)
    results = http_request(url)
    if not isinstance(results, dict):
        print(results)
    else:
        return results


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

def check_links(current_II_Samuel_links, orig_II_Samuel_links, additional_II_Samuel_links):
    found = {str(sorted([l["ref"], l["anchorRef"]])) for l in current_II_Samuel_links}
    orig_II_Samuel_links = {str(sorted(l["refs"])) for l in orig_II_Samuel_links}
    additional_II_Samuel_links = {str(sorted(l["refs"])) for l in additional_II_Samuel_links}
    expecting = additional_II_Samuel_links.union(orig_II_Samuel_links)
    if len(found) != len(expecting):
        print(f"Finding {len(found)} on {server} and expecting {len(expecting)}")
    if len(expecting) - len(found) >= len(additional_II_Samuel_links):
        print("Post was likely unsuccessful.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-k", "--key",
                        help="API Key")
    parser.add_argument("-s", "--server",
                        help="Sefaria server")
    parser.add_argument("-q", "--quantity", default=-1, help="Amount of links to post.")  # -1 means post all links
    parser.add_argument("-r", "--restore", help="Restore cauldron to original condition. Delete anything posted in last run.", default=0)
    args = parser.parse_args()
    server = args.server
    key = args.key
    restore = True if args.restore == '1' else False
    samuel_path = "orig_samuel_links.json"
    joshua_path = "orig_joshua_links.json"
    additional_samuel_path = "new_samuel_links.json"

    # 1. load links. then, if restore is True, first delete anything posted in last run and make sure this succeeded
    if os.path.exists(samuel_path):
        orig_II_Samuel_links = json.load(open(samuel_path, 'r'))
    else:
        orig_II_Samuel_links = get_links("II Samuel", server=server, msg=True)
        for i, l in tqdm(enumerate(orig_II_Samuel_links)):
            orig_II_Samuel_links[i] = {"refs": [l["ref"], l["anchorRef"]], "auto": True, "generated_by": "chaos script", "type": "Commentary"}
        json.dump(orig_II_Samuel_links, open(samuel_path, 'w'))

    if os.path.exists(joshua_path):
        Joshua_links = json.load(open(joshua_path, 'r'))
    else:
        Joshua_links = get_links("Joshua", server=server, msg=True)
        for i, l in tqdm(enumerate(Joshua_links)):
            Joshua_links[i] = {"refs": [l["ref"], l["anchorRef"]], "auto": True, "generated_by": "chaos script", "type": "Commentary"}
        json.dump(Joshua_links, open(joshua_path, 'w'))

    if restore:
        assert os.path.exists(samuel_path), "Did not download II Samuel links yet.  Therefore, can't delete them."
        success = delete_link("II Samuel", API_KEY=key, server=server)
        if success is None:
            print("Restore failed.  Cauldron likely down.")
        old_links = get_links("II Samuel", server=server)
        assert len(old_links) == 0, "Links not successfully deleted"
        success = post_link(orig_II_Samuel_links, server=server, API_KEY=key)
        if success is None:
            print("Restore failed.  Cauldron likely down.")


    # 2. create additional links for II Samuel based on current Joshua links
    additional_II_Samuel_links = []
    if os.path.exists(additional_samuel_path):
        additional_II_Samuel_links = json.load(open(additional_samuel_path, 'r'))
    else:
        for i, l in tqdm(enumerate(Joshua_links)):
            which_ref = 0 if l["refs"][0].startswith("Joshua") else 1
            new_samuel_ref = l["refs"][which_ref].replace("Joshua", "II Samuel")
            other_ref = l["refs"][1-which_ref]
            additional_II_Samuel_links.append({"refs": [new_samuel_ref, other_ref], "auto": True, "generated_by": "chaos script", "type": "Commentary"})
        json.dump(additional_II_Samuel_links, open(additional_samuel_path, 'w'))

    # 3. post additional II Samuel links and then make sure we successfully posted
    quantity = int(args.quantity)
    additional_II_Samuel_links = additional_II_Samuel_links[0:quantity] if quantity > 0 else additional_II_Samuel_links
    if quantity > len(additional_II_Samuel_links):
        print(f"Warning: Cannot post {quantity} as there are only {len(additional_II_Samuel_links)} links to post")
    post_link(additional_II_Samuel_links, server=server, API_KEY=key)
    current_II_Samuel_links = get_links("II Samuel", server=server)
    check_links(current_II_Samuel_links, orig_II_Samuel_links, additional_II_Samuel_links)

    # 4. clean up server.  delete all links in II Samuel and then post local II Samuel links. finally confirm they're back
    delete_link("II Samuel", API_KEY=key, server=server)
    post_link(orig_II_Samuel_links, API_KEY=key, server=server)
    final_II_Samuel_links = get_links("II Samuel", server=server)
    if len(final_II_Samuel_links) == 0:
        print(f"Delete successful but post unsuccessful")
    elif len(final_II_Samuel_links) != len(orig_II_Samuel_links):
        print(f"Finding {len(final_II_Samuel_links)} and expecting {len(orig_II_Samuel_links)} on {server}.  Post unsuccessful")


