"""
Utility functions for django_topics app.  The module_to_pool_mapping and pool_to_module_mapping can be removed once we rename the sheets pool to voices.
"""

def get_topic_pool_name_for_module(active_module):
    """
    Maps active_module to the correct topic pool name.
    
    Args:
        active_module (str): The active module name (e.g., 'library', 'voices', 'sheets')
        
    Returns:
        str: The corresponding topic pool name
        
    Examples:
        get_topic_pool_name_for_module('library') -> 'library'
        get_topic_pool_name_for_module('voices') -> 'sheets'
        get_topic_pool_name_for_module('sheets') -> 'sheets'
    """
    # Mapping from active_module to topic pool name
    module_to_pool_mapping = {
        'library': 'library',
        'voices': 'sheets',  
    }
    
    return module_to_pool_mapping.get(active_module, active_module)


def get_active_module_for_pool(pool_name):
    """
    Reverse mapping: gets the active_module that should use this pool.
    
    Args:
        pool_name (str): The topic pool name
        
    Returns:
        str: The corresponding active_module name
    """
    # Reverse mapping from pool name to active_module
    pool_to_module_mapping = {
        'library': 'library',
        'sheets': 'voices',  # 'sheets' pool is used by 'voices' active_module
    }
    
    return pool_to_module_mapping.get(pool_name, pool_name)
