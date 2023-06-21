from typing import List

def split_at_pipe_with_default(string: str, list_length: int, defaults: List[str]) -> List[str]:
    #length of defaults should be one less than list_length
    substrings = string.split('|', list_length-1)
    if len(substrings) < list_length:
        substrings += defaults[len(substrings)-list_length:]
    return substrings
