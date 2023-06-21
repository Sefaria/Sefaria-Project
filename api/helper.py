from typing import List

def split_at_pipe_with_default(string: str, list_length: int, defaults: List[str]) -> List[str]:
    """
    split a string of query params into list of params by pipe. filling the list with defaults when there are not enough
    :param string:
    :param list_length: the required length of a parameters list
    :param defaults: a list of default strings for potentially missing parameters
    :return: list of parematers
    """
    substrings = string.split('|', list_length-1)
    if len(substrings) < list_length:
        substrings += defaults[len(substrings)-list_length:]
    return substrings
