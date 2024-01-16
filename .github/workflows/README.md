### master branch

- The master branch should be synced in with sefaria's latest update. 
- The best practice is to rebase it every 2 days.
- Pecha.org's features(eg: localization) can be released in the master branch so that Sefaria can use them.


### production-master branch

- This branch is mainly used for production.
- every feature we want to release can be push in this branch after testing on staging


### staging branch

- This branch is use for staging where new feature can test here.


### feature branch

- Every new issue | work | feature work are done on this branch.
- After the new feature is test on staging and then push on production, this branch should be deleted.


### Managing Conflict

- Rebasing of master branch should be done at least every 2 days in order to avoid large conflict.
- If there are conflict in 2 days, then we should try to solve it ASAP.

### Feature release to master

- Create feature branch from master
- push to production-master for deployment
- push to master for feature sharing with sefaria

### Retrieve feature from Sefaria (Specific commit)

- use git cherry-pick commit-hash (eg: e2276f5c01a7b2eb1623131664abbe4cb02bb52d)
- rebase from master to test-staging (all the commits are up to date and ahead commits are on top of it)
- we can cherry pick commit from production-master to master too
