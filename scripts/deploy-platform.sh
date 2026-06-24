#!/usr/bin/env bash
# One-time platform bring-up on EKS (run after `terraform apply` and
# `aws eks update-kubeconfig`). Installs the in-cluster dependencies and the
# secret plumbing. The application itself is deployed by the CD pipeline
# (push to main) or `kubectl apply -k infra/k8s/overlays/dev`.
set -euo pipefail
cd "$(dirname "$0")/.."

TF="terraform -chdir=infra/terraform"
ESO_ROLE_ARN="$($TF output -raw eso_role_arn)"
echo "ESO IRSA role: $ESO_ROLE_ARN"

echo "== helm repos =="
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null 2>&1 || true
helm repo update >/dev/null

kubectl create namespace app --dry-run=client -o yaml | kubectl apply -f -

echo "== default StorageClass (gp3, EBS CSI) =="
kubectl apply -f infra/k8s/helm-values/storageclass.yaml

echo "== External Secrets Operator (IRSA, no static keys) =="
helm upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace \
  -f infra/k8s/helm-values/external-secrets.yaml \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${ESO_ROLE_ARN}" \
  --wait

echo "== Secret store + external secrets (Secrets Manager -> K8s) =="
kubectl apply -f infra/k8s/helm-values/secret-store.yaml
kubectl -n app wait --for=condition=Ready externalsecret/app-secrets --timeout=120s
kubectl -n app wait --for=condition=Ready externalsecret/rabbitmq-credentials --timeout=120s

echo "== Redis + RabbitMQ (StatefulSets + PVC) =="
helm upgrade --install redis bitnami/redis -n app \
  -f infra/k8s/helm-values/redis.yaml --wait
helm upgrade --install rabbitmq bitnami/rabbitmq -n app \
  -f infra/k8s/helm-values/rabbitmq.yaml --wait

echo "== ingress-nginx (NLB) =="
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace \
  -f infra/k8s/helm-values/ingress-nginx.yaml --wait

echo
echo "Platform ready. Now deploy the app:"
echo "  - push to main (GitHub Actions CD), or"
echo "  - build/push images to ECR + 'kubectl apply -k infra/k8s/overlays/dev'"
echo "The CD pipeline also runs the DB migration job before rolling out."
