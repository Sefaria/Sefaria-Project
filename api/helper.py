from typing import List

def split_query_param_and_add_defaults(query_string: str, list_length: int, defaults: List[str]) -> List[str]:
    """
    split a string of query params into list of params by pipe. filling the list with defaults when there are not enough
    :param query_string:
    :param list_length: the required length of a parameters list
    :param defaults: a list of default strings for potentially missing parameters
    :return: list of parematers
    """
    params = query_string.split('|', list_length - 1)
    if len(params) < list_length:
        params += defaults[len(params)-list_length:]
    return params
