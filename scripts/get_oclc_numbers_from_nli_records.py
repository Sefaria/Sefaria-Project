import django
django.setup()
from sefaria.model import *
import re
import csv
import requests
from bs4 import BeautifulSoup
import urllib.parse as urlparse
from urllib.parse import parse_qs
nli_record_cache = {}
def writecsv(versions_to_export, filename):
    f = open(filename,'w')
    w = csv.DictWriter(f,sorted(versions_to_export[0].keys()))
    w.writeheader()
    for version in versions_to_export:
        w.writerow({k:v for k,v in version.items()})
    f.close()
def generate_potential_records():
    print("generating records...")
    versions_digitizedBySefaria = []
    versions = VersionSet({'digitizedBySefaria': True, 'language': 'he'}).array()
    for version in versions:
        try:
            versions_digitizedBySefaria.append({"title": version.title, "versionTitle": version.versionTitle, "language": version.language, "versionSource": version.versionSource,"license": version.license, "digitizedBySefaria": True})
        except:
            versions_digitizedBySefaria.append({"title": version.title, "versionTitle": version.versionTitle, "language": version.language, "versionSource": version.versionSource,"license": False, "digitizedBySefaria": True})
    versions_licenseExistsHe = []
    versions = VersionSet({'license': { "$exists": True}, 'language': 'he'}).array()
    for version in versions:
        try:
            versions_licenseExistsHe.append({"title": version.title, "versionTitle": version.versionTitle, "language": version.language, "versionSource": version.versionSource,"license": version.license, "digitizedBySefaria": True})
        except:
            versions_licenseExistsHe.append({"title": version.title, "versionTitle": version.versionTitle, "language": version.language, "versionSource": version.versionSource,"license": version.license, "digitizedBySefaria": False})
    combined = []
    combined.extend(versions_licenseExistsHe)
    combined.extend(versions_digitizedBySefaria)
    versions_heb_for_export = []
    for version in combined:
        if version not in versions_heb_for_export:
            versions_heb_for_export.append(version)
    versions_en_for_export = []
    versions = VersionSet({'versionTitle': { "$ne": "Sefaria Community Translation"}, 'language': 'en'}).array()
    for version in versions:
        record = {"title": version.title, "versionTitle": version.versionTitle, "language": version.language, "versionSource": version.versionSource}
        try:
            record["license"] = version.license
        except:
            record["license"] = False
        try:
            record["digitizedBySefaria"] = version.digitizedBySefaria
        except:
            record["digitizedBySefaria"] = False
        versions_en_for_export.append(record)
    versions_for_export = versions_en_for_export + versions_heb_for_export
    print("generated " + str(len(versions_for_export)) + " records")
    return(versions_for_export)


def get_records_from_csv():
    print("generating records...")
    with open("data/tmp/Versions_OCLC_BuyLinks - Versions_OCLC_BuyLinks.csv", 'r') as inputfile:
        cin = csv.DictReader(inputfile)
        versions_for_export = []
        for version_obj in cin:
            # try:
                # version_index_title = row["title"]
                # version_title = row["versionTitle"]
                # version_lang = row["language"]
                # version_obj = Version().load({"title": version_index_title, "versionTitle": version_title, "language": version_lang})
                # if version_obj:
                    versions_for_export.append({
                        "digitizedBySefaria": version_obj["digitizedBySefaria"],
                        "language": version_obj["language"],
                        "license": version_obj["license"],
                        "title": version_obj["title"],
                        "versionSource": version_obj["versionSource"],
                        "versionTitle": version_obj["versionTitle"],
                        "purchaseInformationURL": version_obj["purchaseInformationURL"],
                        "image url": version_obj["image url"]
                    })
            # except (KeyboardInterrupt, SystemExit):
            #     raise
            # except:
            #     print("Error at: {} {}".format(version_index_title, version_title))
    print("generated " + str(len(versions_for_export)) + " records")
    return(versions_for_export)

def get_data_for_records(records):
    for record in records:
        nli_record_id = get_nll_id_from_catalog_url(record['versionSource'])
        if nli_record_id:
            print("searching for record: "+ nli_record_id)
            record.update({"updated_version_source": "https://www.nli.org.il/en/books/NNL_ALEPH"+ nli_record_id + "/NLI"})
            OCLC_number = get_oclc_from_nli_id(nli_record_id)
            record.update({"OCLC_number": OCLC_number})
        else:
            record.update({"updated_version_source": ""})
            record.update({"OCLC_number": ""})
    return records
def get_nll_id_from_catalog_url(url):
    if "nli.org" not in url: return
    try:
        regex = re.compile("(\d{9})")
        result = regex.search(url)
        return(result.group(1))
    except:
        return
def get_oclc_from_nli_id(nli_id):
    # the NLI hides their MARC records behind JS loading code -- so we have to be sneaky to get it
    # check the cache before making web request
    try:
        OCLC_number = nli_record_cache[nli_id]
        print("found in cache")
        return(OCLC_number)
    except:
        print("loading NLI catalog record")
        page = requests.get('https://www.nli.org.il/en/books/NNL_ALEPH'+nli_id+'/NLI')
        soup = BeautifulSoup(page.text, 'html.parser')
        #MARC Data is at a secondary URL:
        try:
            MARC_URL = soup.find(class_='d-inline-flex')['href']
        except:
            print("*************\nError: " + nli_id+"\n****************")
            nli_record_cache[nli_id] = ""
            return
        #God forbid they let you load the page w/o authenticating...  spoof spoof spoof
        cookies = {
            'JSESSIONID': '91FD449AE87295A7F0BA51E76268831F',
            'BIGipServerPrimo_Alma_1701': '1714989248.42246.0000',
            'GCLB': 'CJHGr5mNjJ7FrAE',
        }
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:76.0) Gecko/20100101 Firefox/76.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Authorization': 'Bearer eyJraWQiOiJwcmltb0V4cGxvcmVQcml2YXRlS2V5LU5OTCIsImFsZyI6IkVTMjU2In0.eyJpc3MiOiJQcmltbyIsImp0aSI6IiIsImV4cCI6MTU5NTM2MzQ5NCwiaWF0IjoxNTk1Mjc3MDk0LCJ1c2VyIjoiYW5vbnltb3VzLTA3MjBfMjAzMTM0IiwidXNlck5hbWUiOm51bGwsInVzZXJHcm91cCI6IkdVRVNUIiwiYm9yR3JvdXBJZCI6bnVsbCwidWJpZCI6bnVsbCwiaW5zdGl0dXRpb24iOiJOTkwiLCJ2aWV3SW5zdGl0dXRpb25Db2RlIjoiTk5MIiwiaXAiOiIxMDguMjExLjE1My45MSIsInBkc1JlbW90ZUluc3QiOm51bGwsIm9uQ2FtcHVzIjoiZmFsc2UiLCJsYW5ndWFnZSI6ImVuX1VTIiwiYXV0aGVudGljYXRpb25Qcm9maWxlIjoiIiwidmlld0lkIjoiTkxJIiwiaWxzQXBpSWQiOm51bGwsInNhbWxTZXNzaW9uSW5kZXgiOiIifQ.OoUEywXdz5aT3OHE22JQPRxNoNGb3ZxGE6VP2EmgpMGNSYFOnv51-EgpI0PaY0AFAq1okKOu4lHFl6OVi_pPxg',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Referer': 'https://merhav.nli.org.il/primo-explore/sourceRecord?vid=NLI&docId=NNL_ALEPH21255132590005171',
            'Cache-Control': 'max-age=0',
            'TE': 'Trailers',
        }
        # fooled you again -- the MARC is actually at a 3rd URL loaded by the JS from the MARC link above
        params = (
            ('docId', parse_qs(urlparse.urlparse(MARC_URL).query)['docId']),
        )
        print("Attempting to load MARC record")
        response = requests.get('https://merhav.nli.org.il/primo_library/libweb/webservices/rest/v1/sourceRecord', headers=headers, params=params, cookies=cookies)
        try:
            regex = re.compile("035\s.+\(OCoLC\)(.+)")
            results = regex.findall(response.text)
            nli_record_cache[nli_id] = results[-1]
            print(results[-1])
            return(results[-1])
        except:
            print(response.text)
            return("")

#writecsv(get_data_for_records(generate_potential_records()), "oclc.csv")
writecsv(get_data_for_records(get_records_from_csv()), "oclc.csv")
