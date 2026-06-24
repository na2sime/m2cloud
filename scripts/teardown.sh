#!/usr/bin/env bash
# Tears everything down to stop AWS costs after the demo.
# Deletes K8s LoadBalancers/Helm releases FIRST (so the NLB is removed before
# the VPC is destroyed), then runs terraform destroy.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "== removing in-cluster resources (NLB, helm releases) =="
kubectl delete -k infra/k8s/overlays/dev --ignore-not-found 2>/dev/null || true
helm uninstall ingress-nginx -n ingress-nginx 2>/dev/null || true
helm uninstall rabbitmq -n app 2>/dev/null || true
helm uninstall redis -n app 2>/dev/null || true
helm uninstall external-secrets -n external-secrets 2>/dev/null || true

echo "Waiting 30s for the cloud load balancer to be deleted..."
sleep 30

echo "== terraform destroy =="
cd infra/terraform
terraform destroy -auto-approve

echo
echo "Done. The Terraform state bucket (m2cloud-tfstate-*) and lock table remain."
echo "Delete them manually if you want a 100% clean slate."
