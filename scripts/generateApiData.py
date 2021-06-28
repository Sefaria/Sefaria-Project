"""
Used to generate static/js/__mocks__/msw/apiData.js which is used to mock API calls to Sefaria
Edit api_map to add new API endpoints.
dict is of the form {http_method: url_beginning: [{url_end, ...other params which will get passed to `requests` api call}]}
"""

import requests, json
import urllib.parse
# INPUT

SERVER = "http://localhost:8000"
default_api_params = {
    'get': {
        'api/v2/index': {'with_content_counts': '1'},
        'api/texts': {'commentary': '0', 'context': '1', 'pad': '0', 'wrapLinks': '1', 'wrapNamedEntities': '1', 'multiple': '0'},
        'api/v2/topics': {"with_links":"1","annotate_links":"1","with_refs":"1","group_related":"1","annotate_time_period":"1","ref_link_type_filters":"about|popular-writing-of","with_indexes":"1"},
        'api/bulktext': {"asSizedString":"true","minChar":"500","maxChar":"600"},
        'api/related': {"with_sheet_links": "1"},
    }
}
api_map = {
    'get': {
        'api/v2/index': [{'url_end': 'Job'}, {'url_end': 'Orot'}, {'url_end': 'Leviticus'}],
        'api/texts/versions': [{'url_end': 'Job.1'}, {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel.1'}],
        'api/texts': [
            {'url_end': 'Job.1'},
            {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel.1'},
            {'url_end': 'Leviticus.6.1-8.36'},
            {'url_end': 'Leviticus.6.1-23'},
            {'url_end': 'Leviticus.8.1-36'},
            {'url_end': 'Leviticus.5'},
            {'url_end': 'Leviticus.6'},
            {'url_end': 'Leviticus.7'},
            {'url_end': 'Leviticus.8'},
            {'url_end': 'Leviticus.9'},
        ],
        'api/related': [
            {'url_end': 'Leviticus.5'},
            {'url_end': 'Leviticus.6'},
            {'url_end': 'Leviticus.7'},
            {'url_end': 'Leviticus.8'},
            {'url_end': 'Leviticus.9'},
        ],
        'api/v2/topics': [{'url_end': 'lot'}, {'url_end': 'haran'}, {'url_end': 'biblical-figures'}, {'url_end': 'achan'}, {'url_end': 'parashat-tzav'}],
        'api/bulktext': [
            {'url_end': 'Genesis%2013:10-11|Genesis%2019:30-37|Genesis%2019:16-29|Genesis%2013:5-9|Genesis%2019:1-4|Genesis%2014:12-14|Deuteronomy%2023:4-7|Shevuot%2035b:11|Sifrei%20Devarim%2043:11|Nazir%2023a:14-23b:2|Bereishit%20Rabbah%2050:11|Bava%20Kamma%2093a:2|Bava%20Metzia%2086b:20|Jerusalem%20Talmud%20Berakhot%204b:1|Genesis%2013:1|Genesis%2013:12-13|Genesis%2019:5-15|Genesis%2019:38|Genesis%2012:4-5|Genesis%2011:31|Genesis%2014:15-16|Genesis%2024:12-14|Genesis%2039:8|Genesis%2038:27-29|Ruth%204:13-18|Rashi%20on%20Genesis%2024:39:1|Ruth%204:22|Jerusalem%20Talmud%20Sanhedrin%2054b:3|Deuteronomy%2025:5-10|Leviticus%208:23'},
            {'url_end': 'Genesis 11:27|Midrash Lekach Tov, Genesis 11:28:1|Midrash Aggadah, Genesis 11:28:1|Targum Jonathan on Genesis 11:28|Shenei Luchot HaBerit, Aseret HaDibrot, Pesachim, Matzah Ashirah 3:122|Bereishit Rabbah 38:13|Jerusalem Talmud Kiddushin 9b:1|Midrash Tehillim 109:8'},
            {'url_end': 'Joshua 7:19-22|Joshua 7:1|Joshua 7:11|Joshua 7:15-16|Pirkei DeRabbi Eliezer 38:15-16|Midrash Tehillim 147:3|Vayikra Rabbah 9:1|Radak on Joshua 7:19:1|Bamidbar Rabbah 23:6|Midrash Tanchuma, Vayeshev 2:8|Jerusalem Talmud Sanhedrin 27b:5-28a:1|Shem MiShmuel, Nitzavim 2:5|Radak on Joshua 7:13:2|Sefer Kuzari 2:58|Pri Tzadik, Shushan Purim 2:1|Pri Tzadik, Tetzaveh 12:2'},
            {'url_end': 'Leviticus 7:11-12|Vayikra Rabbah 9:7|Rashi on Leviticus 7:12:1|Leviticus 7:13-14|Leviticus 6:9-10|Leviticus 6:5-6|Leviticus 6:7-8|Leviticus 8:31-32|Leviticus 7:1-10|Leviticus 6:1-4|Leviticus 6:11-21|Jeremiah 7:22|Leviticus 7:15-36|Leviticus 8:33-36|Malachi 3:23'},
        ],
        'api/v2/sheets/bulk': [
            {'url_end': '3131|1656|5579|5605|7205|5919|11522|11215|11464|11202|11666|11671|12895|14168|85333|86693|97134|110390|111098|113155|127558|136364|137039|199513|199830|217117|234908|242711|270504|270892|271596|273919|275220|275471|276482|277508|278367|293015|306134'},
            {'url_end': '206083|279819|298330'},
            {'url_end': '94938|107311|177397|246457|257244'},
            {'url_end': '4696|8780|8934|9182|30594|79650|102822|105372|113666|113667|113668|113669|113794|113847|143525|160471|160526|160604|160633|160667|160673|160778|160852|160859|161128|161204|161256|161268|161389|161462|161490|161537|161605|161617|161665|161704|161744|161805|161903|161910|161964|162032|162052|163455|163822|164462|164775|227229|227472|227731|228182|228300|228691|228748|228752|228786|228837|286018|306713|309620|309723|309732|309888|310046|310221|310288|310416|310476|310942'},
        ],
        'api/calendars/next-read': [{'url_end': 'Tzav'}],
    }
}
html_view_map = {
    'topics': [{'url_end': 'lot'}, {'url_end': 'parashat-tzav'}],
    'texts': [{'url_end': ''}]
}

def get_response_dict(http_method, url_begin, request_list, additional_url_param=None):
    response_dict = {}
    for request_dict in request_list:
        request_values = [urllib.parse.unquote(request_dict['url_end'])]
        params = request_dict.get('params', default_api_params.get(http_method, {}).get(url_begin, None))
        if params is not None:
            request_values += [params]
        request_key = "|".join([json.dumps(v, ensure_ascii=False, separators=(',', ':')) for v in request_values])
        url = f'{SERVER}/{url_begin}/{request_dict["url_end"]}'
        if additional_url_param:
            url += '&' + additional_url_param
            url = url.replace('&', '?', 1)
        response = getattr(requests, http_method)(url, **{'params': params})
        response_dict[request_key] = response.json()
    return response_dict

api_data = {}
props_data = {}

# API

for http_method, url_map in api_map.items():
    curr_http_method_dict = {}
    api_data[http_method] = curr_http_method_dict
    for url_begin, request_list in url_map.items():
        curr_http_method_dict["/" + url_begin] = get_response_dict(http_method, url_begin, request_list)

with open('static/js/__mocks__/data/apiData.js', 'w') as fout:
    fout.write(f"export const apiData = {json.dumps(api_data, ensure_ascii=False, separators=(',', ':'))}")

# PROPS

for url_begin, request_list in html_view_map.items():
    props_data["/" + url_begin] = get_response_dict('get', url_begin, request_list, 'onlyProps=1')

with open('static/js/__mocks__/data/propsData.js', 'w') as fout:
    fout.write(f"export const propsData = {json.dumps(props_data, ensure_ascii=False, separators=(',', ':'))}")

# DATA.JS

data_js_response = requests.get(f'{SERVER}/data.js')
with open('static/js/__mocks__/data/data.js', 'w') as fout:
    fout.write(data_js_response.text + f"\nexport default DJANGO_DATA_VARS;")