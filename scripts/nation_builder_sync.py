import django
django.setup()
from sefaria.helper.crm.crm_mediator import CrmMediator

import sys
"""
Mutiple "only" flags can be run at once. If none are run, everything will be run.
Flags:
--trends-only - Only run trend updates, don't sync with nationbuilder
--tags-only -- Only run update tags on nationbuilder
--sustainers-only -- Only sustainers from nationbuilder on mongo
"""

# Get list of current sustainers from profiles

trends_only = False
tags_only = False
sustainers_only = False
nonexistent_nb_id_only = False
gt = 0
skip = []
i = 1
while(i < len(sys.argv)):
    if sys.argv[i] == "--trends-only":
        trends_only = True
    elif sys.argv[i] == "--tags-only":
        tags_only = True
    elif sys.argv[i] == "--sustainers-only":
        sustainers_only = True
    elif sys.argv[i].startswith("--skip="):
        skip = sys.argv[i][7:].split(",")
    elif sys.argv[i] == "--sync-only":
        nonexistent_nb_id_only = True
    elif sys.argv[i] == "--gt=":
        gt = int(sys.argv[i][5:])
    i+=1

    crm_mediator = CrmMediator()
    crm_mediator.sync_sustainers()

# if sustainers_only:
#     connection_manager = CrmFactory().get_connection_manager()
#     connection_manager.sync_sustainers()
# if trends_only:
#     setAllTrends(skip)
# if tags_only:
#     nationbuilder_update_all_tags()
# if nonexistent_nb_id_only:
#     print("nb sync only")
#     add_profiles_to_nationbuilder(gt)
# if not trends_only and not tags_only and not sustainers_only and not nonexistent_nb_id_only:
#     connection_manager = CrmFactory().get_connection_manager()
#     connection_manager.sync_sustainers()
#     add_nationbuilder_id_to_mongo(False)
#     setAllTrends(skip)
#     nationbuilder_update_all_tags()
