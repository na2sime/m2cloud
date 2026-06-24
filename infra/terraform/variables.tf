variable "region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "cluster_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.31"
}

variable "node_instance_type" {
  description = "EKS managed node group instance type"
  type        = string
  default     = "t3.small"
}

variable "node_desired_size" {
  type    = number
  default = 3 # 3 x t3.small: t3.small caps at 11 pods/node (ENI IP limit)
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 4
}

variable "rds_multi_az" {
  description = "Enable RDS Multi-AZ (resilience; costs more)"
  type        = bool
  default     = false
}

variable "db_username" {
  type    = string
  default = "m2cloud"
}

variable "db_name" {
  type    = string
  default = "m2cloud"
}

variable "github_repo" {
  description = "owner/repo allowed to assume the CI/CD role via OIDC"
  type        = string
  default     = "na2sime/m2cloud"
}
