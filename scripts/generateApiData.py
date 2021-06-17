"""
Used to generate static/js/__mocks__/msw/apiData.js which is used to mock API calls to Sefaria
Edit api_map to add new API endpoints.
dict is of the form {http_method: url_beginning: [{url_end, ...other params which will get passed to `requests` api call}]}
"""

import requests, json

SERVER = "http://localhost:8000"
api_map = {
    'get': {
        'api/v2/index': [{'url_end': 'Job'}],
        'api/texts/versions': [{'url_end': 'Job_1'}],
        'api/texts': [
            {'url_end': 'Job_1', 'params': {'context': '1'}},
            {'url_end': 'Orot,_Lights_from_Darkness,_Land_of_Israel_2.2', 'params': {'context': '1'}}
        ],
    }
}
api_data = {}
for http_method, url_map in api_map.items():
    curr_http_method_dict = {}
    api_data[http_method] = curr_http_method_dict
    for url_begin, request_list in url_map.items():
        curr_url_dict = {}
        curr_http_method_dict["/" + url_begin] = curr_url_dict 
        for request_dict in request_list:
            request_key = "|".join([json.dumps(v, ensure_ascii=False, separators=(',', ':')) for v in request_dict.values()])
            url_end = request_dict.pop('url_end')
            response = getattr(requests, http_method)(f'{SERVER}/{url_begin}/{url_end}', **request_dict)
            curr_url_dict[request_key] = response.json()
with open('static/js/__mocks__/msw/apiData.js', 'w') as fout:
    fout.write(f"export const apiData = {json.dumps(api_data, ensure_ascii=False, separators=(',', ':'))}")