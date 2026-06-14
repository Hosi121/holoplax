# GitHub OIDC Provider
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]

  tags = {
    Name = "github-actions-oidc"
  }
}

# Allowed OIDC subjects — restrict to the deploy branches/environments rather
# than the bare `repo:<repo>:*` wildcard (which lets ANY branch, tag, or fork
# pull_request assume the deploy role).
locals {
  oidc_allowed_subs = [
    "repo:${var.github_repo}:ref:refs/heads/main",
    "repo:${var.github_repo}:ref:refs/heads/staging",
    "repo:${var.github_repo}:environment:production",
    "repo:${var.github_repo}:environment:staging",
  ]
}

# IAM Role for GitHub Actions
resource "aws_iam_role" "github_actions" {
  name = "${var.name_prefix}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = local.oidc_allowed_subs
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.name_prefix}-github-actions"
  }
}

# Policy for ECS deployment
resource "aws_iam_role_policy" "ecs_deploy" {
  name = "${var.name_prefix}-ecs-deploy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Service mutations scoped to this project's services.
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService"
        ]
        Resource = [
          "arn:aws:ecs:${var.region}:${var.account_id}:service/${var.name_prefix}-*/*"
        ]
      },
      {
        # RunTask scoped to this project's task definitions.
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        Resource = [
          "arn:aws:ecs:${var.region}:${var.account_id}:task-definition/${var.name_prefix}-*:*"
        ]
      },
      {
        # These actions do not support resource-level scoping in the ECS API.
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:ListTasks",
          "ecs:DescribeTasks"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
          "logs:StartLiveTail"
        ]
        Resource = [
          "arn:aws:logs:${var.region}:${var.account_id}:log-group:/ecs/${var.name_prefix}-*:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = [
          "arn:aws:ecr:${var.region}:${var.account_id}:repository/${var.name_prefix}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          "arn:aws:iam::${var.account_id}:role/${var.name_prefix}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${var.name_prefix}-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:StartDBInstance",
          "rds:StopDBInstance"
        ]
        Resource = [
          "arn:aws:rds:${var.region}:${var.account_id}:db:${var.name_prefix}-*"
        ]
      }
    ]
  })
}
