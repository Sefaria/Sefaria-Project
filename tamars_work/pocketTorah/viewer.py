import json
import pprint 


with open('Bamidbar-1.json') as json_file:
    data = json.load(json_file)  
    
pprint.pprint(data)
    