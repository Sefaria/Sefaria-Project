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
    }
}
api_map = {
    'get': {
        'api/v2/index': [{'url_end': 'Job'}, {'url_end': 'Orot'}],
        'api/texts/versions': [{'url_end': 'Job.1'}, {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel.1'}],
        'api/texts': [
            {'url_end': 'Job.1'},
            {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel.1'}
        ],
        'api/v2/topics': [{'url_end': 'lot'}],
        'api/bulktext': [
            {'url_end': 'Genesis%2013:10-11|Genesis%2019:30-37|Genesis%2019:16-29|Genesis%2013:5-9|Genesis%2019:1-4|Genesis%2014:12-14|Deuteronomy%2023:4-7|Shevuot%2035b:11|Sifrei%20Devarim%2043:11|Nazir%2023a:14-23b:2|Bereishit%20Rabbah%2050:11|Bava%20Kamma%2093a:2|Bava%20Metzia%2086b:20|Jerusalem%20Talmud%20Berakhot%204b:1|Genesis%2013:1|Genesis%2013:12-13|Genesis%2019:5-15|Genesis%2019:38|Genesis%2012:4-5|Genesis%2011:31|Genesis%2014:15-16|Genesis%2024:12-14|Genesis%2039:8|Genesis%2038:27-29|Ruth%204:13-18|Rashi%20on%20Genesis%2024:39:1|Ruth%204:22|Jerusalem%20Talmud%20Sanhedrin%2054b:3|Deuteronomy%2025:5-10|Leviticus%208:23'},
        ],
        'api/v2/sheets/bulk': [
            {'url_end': '3131|1656|5579|5605|7205|5919|11522|11215|11464|11202|11666|11671|12895|14168|85333|86693|97134|110390|111098|113155|127558|136364|137039|199513|199830|217117|234908|242711|270504|270892|271596|273919|275220|275471|276482|277508|278367|293015|306134'},
        ]
    }
}
html_view_map = {
    'topics': [{'url_end': 'lot'}],
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

with open('static/js/__mocks__/msw/apiData.js', 'w') as fout:
    fout.write(f"export const apiData = {json.dumps(api_data, ensure_ascii=False, separators=(',', ':'))}")

# PROPS

for url_begin, request_list in html_view_map.items():
    props_data["/" + url_begin] = get_response_dict('get', url_begin, request_list, 'onlyProps=1')

with open('static/js/__mocks__/msw/propsData.js', 'w') as fout:
    fout.write(f"export const propsData = {json.dumps(props_data, ensure_ascii=False, separators=(',', ':'))}")

# DATA.JS

data_js_response = requests.get(f'{SERVER}/data.js')
with open('static/js/__mocks__/msw/data.js', 'w') as fout:
    fout.write(data_js_response.text + f"\nexport default DJANGO_DATA_VARS;")