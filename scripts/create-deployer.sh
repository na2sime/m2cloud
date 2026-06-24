#!/usr/bin/env bash
# Creates a dedicated IAM user for Terraform/deploys (instead of using root).
# Stores its credentials under the local AWS CLI profile "m2cloud".
# Run this yourself: `! bash scripts/create-deployer.sh`
set -euo pipefail

USER_NAME="m2cloud-deployer"
REGION="eu-west-1"

aws iam create-user --user-name "$USER_NAME" 2>/dev/null && echo "user created" || echo "user already exists"
aws iam attach-user-policy --user-name "$USER_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
echo "AdministratorAccess attached"

OUT="$(aws iam create-access-key --user-name "$USER_NAME" --output json)"
AKID="$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["AccessKey"]["AccessKeyId"])')"
SAK="$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["AccessKey"]["SecretAccessKey"])')"

aws configure set aws_access_key_id "$AKID" --profile m2cloud
aws configure set aws_secret_access_key "$SAK" --profile m2cloud
aws configure set region "$REGION" --profile m2cloud

echo "Profile 'm2cloud' configured (access key ${AKID:0:8}…)."
sleep 8 # IAM eventual consistency
AWS_PROFILE=m2cloud aws sts get-caller-identity
