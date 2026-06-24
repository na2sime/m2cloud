#!/usr/bin/env bash
# Build + push the 4 service images to ECR, run the DB migration job, and roll
# out the app to EKS. Use after `terraform apply` + scripts/deploy-platform.sh.
# Builds linux/amd64 (EKS nodes are x86_64; a macOS arm64 host uses emulation).
#   AWS_PROFILE=m2cloud bash scripts/deploy-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AWS_PROFILE:=m2cloud}"
export AWS_PROFILE
REGION="eu-west-1"

TF="terraform -chdir=infra/terraform"
REGISTRY="$($TF output -raw ecr_registry)"
TAG="$(git rev-parse --short HEAD)"
echo "registry=$REGISTRY  tag=$TAG"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

# Ensure a buildx builder that can build+push linux/amd64.
docker buildx create --name m2builder --use >/dev/null 2>&1 || docker buildx use m2builder >/dev/null 2>&1 || true

build_push() {
  local svc="$1" file="$2"; shift 2
  echo "== build/push $svc =="
  docker buildx build --platform linux/amd64 "$@" \
    -f "$file" \
    -t "$REGISTRY/m2cloud-$svc:$TAG" -t "$REGISTRY/m2cloud-$svc:latest" \
    --push .
}

for svc in gateway-api realtime worker; do
  build_push "$svc" docker/node-service.Dockerfile --build-arg "SERVICE=$svc"
done
build_push web docker/web.Dockerfile

echo "== DB migration job =="
kubectl -n app delete job migrate --ignore-not-found
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
  namespace: app
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: $REGISTRY/m2cloud-gateway-api:$TAG
          command: ["node", "dist/migrate.js"]
          env:
            - name: MIGRATIONS_DIR
              value: /app/migrations
          envFrom:
            - secretRef:
                name: app-secrets
EOF
kubectl -n app wait --for=condition=complete job/migrate --timeout=180s

echo "== deploy app =="
kubectl apply -k infra/k8s/overlays/dev
for d in gateway-api realtime worker web; do
  kubectl -n app rollout status "deploy/$d" --timeout=240s
done

echo
echo "Ingress (NLB) hostname:"
kubectl -n app get ingress m2cloud -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
echo
