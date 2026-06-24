output "region" {
  value = var.region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "configure_kubectl" {
  description = "Run this to point kubectl at the cluster"
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}"
}

output "ecr_registry" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.svc : k => r.repository_url }
}

output "gha_role_arn" {
  description = "IAM role ARN GitHub Actions assumes via OIDC"
  value       = aws_iam_role.gha.arn
}

output "eso_role_arn" {
  description = "IRSA role ARN for External Secrets Operator"
  value       = module.eso_irsa.iam_role_arn
}

output "rds_endpoint" {
  value     = module.rds.db_instance_endpoint
  sensitive = true
}

output "app_secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}
