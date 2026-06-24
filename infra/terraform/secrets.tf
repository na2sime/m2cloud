# One JSON secret in AWS Secrets Manager holds all app secrets. External
# Secrets Operator syncs it into the cluster (see infra/k8s/helm-values).
resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "rabbitmq" {
  length  = 24
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "m2cloud/app"
  description             = "m2cloud application secrets (DB, JWT, RabbitMQ)"
  recovery_window_in_days = 0 # allow immediate delete on teardown

  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL      = "postgres://${var.db_username}:${random_password.db.result}@${module.rds.db_instance_endpoint}/${var.db_name}"
    JWT_SECRET        = random_password.jwt.result
    RABBITMQ_URL      = "amqp://m2cloud:${random_password.rabbitmq.result}@rabbitmq.app.svc.cluster.local:5672"
    RABBITMQ_PASSWORD = random_password.rabbitmq.result
  })
}
