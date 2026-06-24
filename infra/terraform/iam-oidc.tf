# GitHub Actions authenticates to AWS via OIDC federation — NO long-lived
# access keys are ever stored in GitHub. The CI role can only be assumed by
# workflows running in this specific repository.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  tags = local.tags
}

data "aws_iam_policy_document" "gha_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "gha" {
  name               = "${local.name}-gha"
  assume_role_policy = data.aws_iam_policy_document.gha_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "gha_perms" {
  # ECR auth token is account-wide by API design.
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Push/pull only to our service repositories.
  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.svc : r.arn]
  }

  # Read cluster info to build a kubeconfig for the rollout.
  statement {
    sid       = "EksDescribe"
    actions   = ["eks:DescribeCluster"]
    resources = [module.eks.cluster_arn]
  }
}

resource "aws_iam_role_policy" "gha" {
  name   = "${local.name}-gha"
  role   = aws_iam_role.gha.id
  policy = data.aws_iam_policy_document.gha_perms.json
}

# Map the CI role into the cluster (Kubernetes RBAC) via EKS access entries
# so `kubectl apply` works during the deploy step.
resource "aws_eks_access_entry" "gha" {
  cluster_name  = module.eks.cluster_name
  principal_arn = aws_iam_role.gha.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "gha" {
  cluster_name  = module.eks.cluster_name
  principal_arn = aws_iam_role.gha.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}
