"""
Used to generate static/js/__mocks__/msw/apiData.js which is used to mock API calls to Sefaria
Edit api_map to add new API endpoints.
dict is of the form {http_method: url_beginning: [{url_end, ...other params which will get passed to `requests` api call}]}
"""

import requests, json

# INPUT

SERVER = "http://localhost:8000"
api_map = {
    'get': {
        'api/v2/index': [{'url_end': 'Job'}, {'url_end': 'Orot'}],
        'api/texts/versions': [{'url_end': 'Job.1'}, {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel.1'}],
        'api/texts': [
            {'url_end': 'Job.1', 'params': {'context': '1'}},
            {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel.1', 'params': {'context': '1'}}
        ],
        'api/v2/topics': [{'url_end': 'lot'}]
    }
}
html_view_map = {
    'topics': [{'url_end': 'lot'}],
    'texts': [{'url_end': ''}]
}

def get_response_dict(http_method, url_begin, request_list, additional_url_param=None):
    response_dict = {}
    for request_dict in request_list:
        request_key = "|".join([json.dumps(v, ensure_ascii=False, separators=(',', ':')) for v in request_dict.values()])
        url_end = request_dict.pop('url_end')
        url = f'{SERVER}/{url_begin}/{url_end}'
        if additional_url_param:
            url += '&' + additional_url_param
            url = url.replace('&', '?', 1)
        response = getattr(requests, http_method)(url, **request_dict)
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