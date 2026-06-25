#!/usr/bin/env bash
# Tears everything down to stop AWS costs after the demo.
# Order matters: remove the in-cluster AWS resources (NLB + EBS volumes from
# PVCs) FIRST, otherwise the VPC destroy fails and volumes are left orphaned.
#   AWS_PROFILE=m2cloud bash scripts/teardown.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$PATH"

echo "== 1. app + raw rabbitmq =="
kubectl delete -k infra/k8s/overlays/dev --ignore-not-found 2>/dev/null || true
kubectl delete -f infra/k8s/helm-values/rabbitmq-raw.yaml --ignore-not-found 2>/dev/null || true

echo "== 2. helm releases (the NLB is removed with ingress-nginx) =="
helm uninstall ingress-nginx -n ingress-nginx 2>/dev/null || true
helm uninstall redis -n app 2>/dev/null || true
helm uninstall external-secrets -n external-secrets 2>/dev/null || true

echo "== 3. PVCs (so the EBS CSI driver deletes the EBS volumes) =="
kubectl delete pvc --all -n app --ignore-not-found 2>/dev/null || true

echo "Waiting 45s for the cloud load balancer + EBS volumes to be deleted..."
sleep 45

echo "== 4. terraform destroy =="
cd infra/terraform
terraform destroy -auto-approve

echo
echo "Done. The Terraform state bucket (m2cloud-tfstate-*) + DynamoDB lock table"
echo "and the IAM user 'm2cloud-deployer' remain (negligible cost) — delete"
echo "them manually for a 100% clean slate."
