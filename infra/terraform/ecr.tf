resource "aws_ecr_repository" "svc" {
  for_each = toset(local.services)

  name                 = "${local.name}-${each.value}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # allow teardown even with images present

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "svc" {
  for_each   = aws_ecr_repository.svc
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
