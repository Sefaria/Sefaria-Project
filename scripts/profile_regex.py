import timeit


prep = """import regex
import re
import re2
import sefaria.model as model
import sefaria.texts as texts
titles = model.get_text_titles()
titles = titles + titles + titles + titles + titles 
text = ",".join(texts.get_text("Bereishit Rabbah 1")["text"])

re_escaped = map(re.escape, titles)
re_combined = '|'.join(sorted(re_escaped, key=len, reverse=True)) #Match longer titles first
re_re = re.compile(re_combined)

regex_escaped = map(regex.escape, titles)
regex_combined = '|'.join(sorted(regex_escaped, key=len, reverse=True)) #Match longer titles first
regex_re = regex.compile(regex_combined)

re2_escaped = map(re2.escape, titles)
re2_combined = '|'.join(sorted(re2_escaped, key=len, reverse=True)) #Match longer titles first
re2_re = re2.compile(re2_combined, max_mem=128388608)
"""

find_test = """
[title for title in titles if text.find(title) > -1]
"""

re_test = """
re_re.findall(text)
"""

regex_test = """
regex_re.findall(text)
"""
 
re2_test = """
re2_re.findall(text)
"""

in_test = """
[title for title in titles if title in text]
"""

timeit.timeit(in_test, prep, number = 100)
timeit.timeit(find_test, prep, number = 100)
timeit.timeit(re_test, prep, number = 100)
timeit.timeit(regex_test, prep, number = 100)
timeit.timeit(re2_test, prep, number = 100)