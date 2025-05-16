### master branch

- The master branch should be synced in with sefaria's latest update. 
- The best practice is to rebase it every 2 days.
- fodian.org's features(eg: localization) can be released in the master branch so that Sefaria can use them.


### production-master branch

- This branch is mainly used for production.
- every feature we want to release can be push in this branch after testing on staging


### staging branch

- This branch is use for staging where new feature can test here.


### feature branch

- Feature branch is created from production-master
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

- use git cherry-pick commit-hash (eg: commit-hash : e2276f5c01a7b2eb1623131664abbe4cb02bb52d)
- rebase from master to test-staging (all the commits are up to date and ahead commits are on top of it)
- we can cherry pick commit from production-master to master too

### Some useful git command

- git fetch (fetch the newly created branch in remote)
- git rebase (source branch) (we should apply it on the target branch. Eg: if need to rebase from master to staging, checkout staging branch and git rebase master.)
- git diff origin/branch name (check the commit difference b/w origin i.e remote branch and current branch i.e local branch)

![gitbranch](https://github.com/OpenPecha/fodian.org/assets/102473656/a09d90cb-5161-4fd1-97e6-4cc990fe240c)
