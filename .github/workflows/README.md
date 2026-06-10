# Sefaria-Project Pipelines

## Commit is pushed to branch

Any commit to a branch will trigger the `continuous` pipeline in limited run mode.  This will result in the node, web and asset images being built and pushed to the dev GCR registry.  The images names will reflect which branch they are built from, and the image tags will indicate the commit and datetime.

## Commit is pushed to PR branch

If a commit is pushed to a branch that has an open PR, the `continuous` pipeline is triggered in full run mode.  This will build and push the images asin limited mode, and then additionally deploy a sandbox instance using the built images.  The sandbox is deployed as a helm install, using the latest version of the chart, and a values file located in `build/ci/`, which is modified during the pipeline to indicate which commit triggered the deployment.  After the sandbox deployment has been verified, pytest and selenium tests are executed in the sandbox, after which the sandbox is destroyed.

## Commit that affects `helm-charts` is pushed to a branch

Any commit that affects the contents of the `helm-charts` folder will additionally trigger the `helm` pipeline.  This runs a lint job to check the chart contents.  

## Commit that affects `helm-charts` is merged to master

Any changes to the helm-charts folder that are merged to master will trigger the `helm-release` pipeline.  The pipeline calculates the next version to apply to the chart, which is currently always a minor version bump each time it is run.  It then creates a release event via the github api, which in turns applies a `helm-chart-version` tag to the commit.  In addition, it creates a packaged version of the chart, including metadata related to the release version, and copies it to the `gh-pages branch` of the project.  `gh-pages` has been reserved to be automatically published as a web page by github, which in this instance functions as a Helm Repository

## Version tag matching `^v.*` is applied to master 

The intended method of applying a release version tag to the repository is by manually publishing a release via the github UI.

Google Cloud Build monitors the repository for updates to release version tags.  When one is detected, Cloud Build creates new images for node, web and asset, performs various bash based templating actions to generate a helm chart and then deploys the chart to the production cluster with a fixed values file.

| Note: the cloudbuild deployment is being deprecated and will be replaced by a github based pipeline that uses the in-repo chart

When github detected a release verson tag is applied to the repository, it will trigger the production deploy pipeline.  This builds the node, web and asset images, and then pushes them to the production gcr registry.  It then performs a helm upgrade using a values file in `build/ci` and a specified chart version pullfrom the GH Pages Helm Registry.

| Note: the github based deployment is still in testing and deploys a second 'test' prod-like instance.

