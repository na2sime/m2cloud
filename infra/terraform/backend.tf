# Remote state in S3 with DynamoDB locking. Create these once with
# scripts/bootstrap-tf-backend.sh BEFORE `terraform init`.
terraform {
  backend "s3" {
    bucket         = "m2cloud-tfstate-503577850741"
    key            = "dev/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "m2cloud-tf-lock"
    encrypt        = true
  }
}
