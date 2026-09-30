# auth-service/Makefile — run from this directory
CTX     ?= gke_development-205018_us-east1-b_cluster-1
ENV     ?= authpoc
NS      ?= default
KUBECTL  = kubectl --context $(CTX) -n $(NS)
CHART    = ../helm-chart/sefaria
RENDER   = helm template $(ENV) $(CHART) --set deployEnv=$(ENV) --set gateway.enabled=true --set authService.enabled=true --set authService.image.tag=test

.PHONY: test build helm-lint helm-render helm-matrix crd-gate shellcheck
test:
	go vet ./... && go test -race -count=1 ./...
build:
	mkdir -p bin && for b in authsvc keyadmin; do CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o bin/$$b ./cmd/$$b; done
helm-lint:
	cd .. && ct lint --charts helm-chart/sefaria --validate-maintainers=false
helm-render:
	$(RENDER) > /tmp/authpoc-render.yaml && kubeconform -strict -ignore-missing-schemas -summary /tmp/authpoc-render.yaml && bash scripts/render-check.sh /tmp/authpoc-render.yaml
crd-gate:
	bash scripts/crd-gate.sh $(CTX)
shellcheck:
	shellcheck -S warning scripts/*.sh
	bash scripts/test-policy-gate.sh
helm-matrix:
	@set -e; C=../helm-chart/sefaria; \
	echo "== flag off: no auth objects"; helm template x $$C --set deployEnv=x | yq 'select(.kind == "SecurityPolicy" or (.metadata.name | test("auth-service"))) | .kind' | grep -c . | grep -qx 0; \
	echo "== one replica: no PDB"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.image.tag=test | yq 'select(.kind=="PodDisruptionBudget" and (.metadata.name | test("auth-service"))) | .kind' | grep -c . | grep -qx 0; \
	echo "== two replicas: PDB minAvailable 1"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.image.tag=test --set authService.replicaCount=2 | yq 'select(.kind=="PodDisruptionBudget" and (.metadata.name | test("auth-service"))) | .spec.minAvailable' | grep -qx 1; \
	echo "== postgres NOTIFY channel wired"; [ "$$(helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.image.tag=test | yq 'select(.kind=="Deployment" and .metadata.name=="x-auth-service") | .spec.template.spec.containers[0].env[] | .name' | grep -cx PG_NOTIFY_CHANNEL)" = 1 ]; \
	echo "== grpc"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.image.tag=test | yq 'select(.kind=="SecurityPolicy") | .spec.extAuth.grpc.backendRefs[0].port' | grep -qx 9090; \
	echo "== no jwt block"; helm template x $$C --set deployEnv=x --set authService.enabled=true --set authService.image.tag=test | yq 'select(.kind=="SecurityPolicy") | .spec.jwt' | grep -qx null; \
	echo "== enabled without an image tag fails"; ! helm template x $$C --set deployEnv=x --set authService.enabled=true >/dev/null 2>&1; \
	echo "== client x-sefaria-* stripped only when enabled"; helm template x $$C --set deployEnv=x --set gateway.enabled=true --set authService.enabled=true --set authService.image.tag=test | yq 'select(.kind=="ClientTrafficPolicy") | .spec.headers.earlyRequestHeaders.remove | length' | grep -qx 3; [ "$$(helm template x $$C --set deployEnv=x --set gateway.enabled=true | grep -c earlyRequestHeaders)" = 0 ]; \
	echo "helm-matrix OK"
