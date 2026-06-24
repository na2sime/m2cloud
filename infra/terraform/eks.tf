module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = local.name
  cluster_version = var.cluster_version

  # Public endpoint so kubectl / CI can reach the API server.
  cluster_endpoint_public_access = true

  # Grant the Terraform caller cluster-admin via EKS access entries.
  enable_cluster_creator_admin_permissions = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    default = {
      instance_types = [var.node_instance_type]
      capacity_type  = "SPOT" # cost optimization
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      desired_size   = var.node_desired_size
    }
  }

  cluster_addons = {
    coredns    = {}
    kube-proxy = {}
    vpc-cni    = {}
  }

  tags = local.tags
}

# The EKS node security group only allows cross-node pod traffic on ports
# 1025-65535 by default. The web service listens on port 80, so allow it
# explicitly between nodes (otherwise the ingress can't reach web pods on
# another node). (Live cluster also has this rule; added here for fresh deploys.)
resource "aws_security_group_rule" "nodes_web_port_80" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  security_group_id        = module.eks.node_security_group_id
  source_security_group_id = module.eks.node_security_group_id
  description              = "Cross-node pod traffic on port 80 (web service)"
}

# EBS CSI driver installed as a separate addon so its IRSA role (which depends
# on the cluster's OIDC provider) does not create a module-level cycle.
resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = module.eks.cluster_name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = module.ebs_csi_irsa.iam_role_arn

  tags = local.tags
}
