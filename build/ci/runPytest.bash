#!/bin/bash

kubectl exec $(kubectl get pod --selector=stackRole=django,deployEnv=${GITHUB_SHA:0:6} -o jsonpath='{range .items[0]}{.metadata.name}{end}') -- py.test -m "not deep and not failing"
