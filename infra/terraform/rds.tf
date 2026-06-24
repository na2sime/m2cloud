resource "random_password" "db" {
  length  = 24
  special = false
}

# RDS reachable ONLY from the EKS node security group, in private subnets.
resource "aws_security_group" "rds" {
  name_prefix = "${local.name}-rds-"
  description = "Postgres access from EKS nodes only"
  vpc_id      = module.vpc.vpc_id

  tags = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_from_nodes" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = module.eks.node_security_group_id
  description              = "Postgres from EKS nodes"
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.9"

  identifier = "${local.name}-pg"

  engine               = "postgres"
  engine_version       = "16"
  family               = "postgres16"
  major_engine_version = "16"
  instance_class       = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  manage_master_user_password = false

  multi_az               = var.rds_multi_az
  vpc_security_group_ids = [aws_security_group.rds.id]

  create_db_subnet_group = true
  subnet_ids             = module.vpc.private_subnets

  backup_retention_period = 7
  deletion_protection     = false
  skip_final_snapshot     = true

  tags = local.tags
}
