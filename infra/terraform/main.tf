provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "m2cloud"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name = "m2cloud"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)

  services = ["gateway-api", "realtime", "worker", "web"]

  tags = {
    Project = "m2cloud"
  }
}
