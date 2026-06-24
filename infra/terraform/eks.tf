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

# EBS CSI driver installed as a separate addon so its IRSA role (which depends
# on the cluster's OIDC provider) does not create a module-level cycle.
resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = module.eks.cluster_name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = module.ebs_csi_irsa.iam_role_arn

  tags = local.tags
}
