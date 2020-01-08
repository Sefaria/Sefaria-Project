# -*- coding: utf-8 -*-

import re


input_rows = []
filename = 'log/sefaria.log'
l_regex = re.compile(r'Wrap Ref Warning: Ref:\((.*)\)', re.UNICODE)
with open(filename, 'rb') as infile:
    for line in infile:
        line = line.strip()
        match = l_regex.search(line)
        if match:
            input_rows.append(match.group(1))

input_rows = set(input_rows)
for row in input_rows:
    print(row)