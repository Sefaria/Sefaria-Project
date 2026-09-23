# auth-service/Makefile — run from this directory
CTX     ?= gke_development-205018_us-east1-b_cluster-1
ENV     ?= authpoc
NS      ?= default
KUBECTL  = kubectl --context $(CTX) -n $(NS)
CHART    = ../helm-chart/sefaria
RENDER   = helm template $(ENV) $(CHART) --set deployEnv=$(ENV) --set authService.enabled=true --set authService.mintStub.enabled=true --set authService.rateLimit.enabled=true

.PHONY: test build helm-lint helm-render crd-gate shellcheck
test:
	go vet ./... && go test -race -count=1 ./...
build:
	mkdir -p bin && for b in authsvc keyadmin mintstub; do CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o bin/$$b ./cmd/$$b; done
helm-lint:
	cd .. && ct lint --charts helm-chart/sefaria --validate-maintainers=false
helm-render:
	$(RENDER) > /tmp/authpoc-render.yaml && kubeconform -strict -ignore-missing-schemas -summary /tmp/authpoc-render.yaml && bash scripts/render-check.sh /tmp/authpoc-render.yaml
crd-gate:
	bash scripts/crd-gate.sh $(CTX)
shellcheck:
	shellcheck -S warning scripts/*.sh
helm-matrix:
	@set -e; C=../helm-chart/sefaria; \
	echo "== flag off: no auth objects"; helm template x $$C --set deployEnv=x | yq 'select(.kind == "SecurityPolicy" or (.metadata.name | test("auth-service|mint"))) | .kind' | grep -c . | grep -qx 0; \
	echo "== one replica: no PDB"; helm template x $$C --set deployEnv=x --set authService.enabled=true | yq 'select(.kind=="PodDisruptionBudget" and (.metadata.name | test("auth-service"))) | .kind' | grep -c . | grep -qx 0; \
	echo "== two replicas: PDB minAvailable 1"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.replicaCount=2 | yq 'select(.kind=="PodDisruptionBudget" and (.metadata.name | test("auth-service"))) | .spec.minAvailable' | grep -qx 1; \
	echo "== push: postgres channel, no app Redis by default"; helm template x $$C --set deployEnv=x --set authService.enabled=true | yq 'select(.kind=="Deployment" and .metadata.name=="x-auth-service") | .spec.template.spec.containers[0].env[] | .name' | grep -x PG_NOTIFY_CHANNEL >/dev/null && ! helm template x $$C --set deployEnv=x --set authService.enabled=true | grep -q REDIS_ADDR; \
	echo "== push.redis=true adds REDIS_ADDR"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.push.redis=true | grep -q 'name: REDIS_ADDR'; \
	echo "== grpc"; helm template x $$C --set deployEnv=x --set authService.enabled=true | yq 'select(.kind=="SecurityPolicy") | .spec.extAuth.grpc.backendRefs[0].port' | grep -qx 9090; \
	echo "== http"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.transport=http | yq 'select(.kind=="SecurityPolicy") | .spec.extAuth.http.headersToBackend | length' | grep -qx 3; \
	echo "== jwt authsvc"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.jwt.mode=authsvc | yq 'select(.kind=="SecurityPolicy") | .spec.jwt' | grep -qx null; \
	echo "== jwt failOpen"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.jwt.failOpen=true | yq 'select(.kind=="SecurityPolicy") | .spec.jwt | has("optional")' | grep -qx false; \
	echo "== ratelimit multiplier"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.rateLimit.enabled=true --set authService.rateLimit.testLimitsMultiplier=100 | yq 'select(.kind=="BackendTrafficPolicy") | .spec.rateLimit.global.rules[0].limit.requests' | grep -qx 1000; \
	echo "helm-matrix OK"
