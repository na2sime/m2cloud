# IRSA roles — workloads assume narrowly-scoped IAM roles via the cluster's
# OIDC provider, with NO static credentials.

# EBS CSI controller — lets PVCs (Redis/RabbitMQ) provision EBS volumes.
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.44"

  role_name             = "${local.name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }

  tags = local.tags
}

# External Secrets Operator — read-only access to ONLY the m2cloud/app secret.
module "eso_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.44"

  role_name                             = "${local.name}-eso"
  attach_external_secrets_policy        = true
  external_secrets_secrets_manager_arns = ["${aws_secretsmanager_secret.app.arn}*"]

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["external-secrets:external-secrets"]
    }
  }

  tags = local.tags
}
