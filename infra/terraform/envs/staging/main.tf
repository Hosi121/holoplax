terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "holoplax-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "ap-northeast-3"
    encrypt        = true
    dynamodb_table = "holoplax-terraform-lock"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  db_password     = var.db_password_override != "" ? var.db_password_override : random_password.db.result
  account_id      = data.aws_caller_identity.current.account_id
  ecr_app_url     = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.name_prefix}-app"
  ecr_metrics_url = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.name_prefix}-metrics"
}

resource "random_password" "db" {
  length  = 20
  special = false
}

module "network" {
  source = "../../modules/network"

  name_prefix          = var.name_prefix
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  azs                  = local.azs
}

module "ecr_app" {
  source = "../../modules/ecr"

  repository_name = "${var.name_prefix}-app"
}

module "ecr_metrics" {
  source = "../../modules/ecr"

  repository_name = "${var.name_prefix}-metrics"
}

module "alb" {
  source = "../../modules/alb"

  name_prefix           = var.name_prefix
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  app_port              = var.app_port
  certificate_arn       = var.certificate_arn
  enable_https_redirect = var.enable_https_redirect
  target_type           = "ip"
}

module "s3" {
  source = "../../modules/s3"

  name_prefix = var.name_prefix
  bucket_name = var.bucket_name
  public_read = var.public_read
}

module "ecs" {
  source = "../../modules/ecs"

  name_prefix           = var.name_prefix
  region                = var.region
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.public_subnet_ids
  alb_security_group_id = module.alb.security_group_id
  target_group_arn      = module.alb.target_group_arn
  container_image       = "${module.ecr_app.repository_url}:latest"
  container_port        = var.app_port
  cpu                   = var.ecs_cpu
  memory                = var.ecs_memory
  desired_count         = var.ecs_desired_count
  s3_bucket_arn         = module.s3.bucket_arn

  environment_variables = [
    { name = "NODE_ENV", value = "production" },
    { name = "NEXTAUTH_URL", value = var.app_domain != "" ? "https://${var.app_domain}" : "http://${module.alb.dns_name}" },
  ]

  secrets = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.db.arn}:database_url::" },
    { name = "NEXTAUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:nextauth_secret::" },
    { name = "ENCRYPTION_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:encryption_key::" },
    { name = "OPENAI_API_KEY", valueFrom = "${aws_secretsmanager_secret.openai.arn}:api_key::" },
  ]

  secrets_arns = [aws_secretsmanager_secret.db.arn, aws_secretsmanager_secret.openai.arn, aws_secretsmanager_secret.app.arn]
}

module "rds" {
  source = "../../modules/rds"

  name_prefix           = var.name_prefix
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = local.db_password
  instance_class        = var.db_instance_class
  multi_az              = var.db_multi_az
  app_security_group_id = module.ecs.security_group_id
}

module "metrics_job" {
  source = "../../modules/ecs-scheduled-task"

  name_prefix         = var.name_prefix
  task_name           = "metrics"
  region              = var.region
  vpc_id              = module.network.vpc_id
  subnet_ids          = module.network.public_subnet_ids
  cluster_arn         = module.ecs.cluster_arn
  container_image     = "${module.ecr_metrics.repository_url}:latest"
  schedule_expression = "cron(0 0 * * ? *)"
  cpu                 = 256
  memory              = 512

  secrets = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.db.arn}:database_url::" },
  ]

  secrets_arns = [aws_secretsmanager_secret.db.arn]
}

resource "aws_secretsmanager_secret" "db" {
  name = "${var.name_prefix}-db-secret"
}

resource "aws_secretsmanager_secret" "openai" {
  name = "${var.name_prefix}-openai-secret"
}

resource "aws_secretsmanager_secret" "app" {
  name = "${var.name_prefix}-app-secret"
}

resource "random_password" "nextauth_secret" {
  length  = 32
  special = false
}

resource "random_password" "encryption_key" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    nextauth_secret = random_password.nextauth_secret.result
    encryption_key  = random_password.encryption_key.result
  })
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username     = var.db_username
    password     = local.db_password
    dbname       = var.db_name
    host         = module.rds.endpoint
    port         = 5432
    database_url = "postgresql://${var.db_username}:${local.db_password}@${module.rds.endpoint}:5432/${var.db_name}"
  })
}

output "alb_dns_name" {
  value = module.alb.dns_name
}

output "db_endpoint" {
  value = module.rds.endpoint
}

output "db_secret_arn" {
  value = aws_secretsmanager_secret.db.arn
}

output "openai_secret_arn" {
  value = aws_secretsmanager_secret.openai.arn
}

output "s3_bucket_name" {
  value = module.s3.bucket_name
}

output "app_secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "ecr_app_repository_url" {
  value = module.ecr_app.repository_url
}

output "ecr_metrics_repository_url" {
  value = module.ecr_metrics.repository_url
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "ecs_service_name" {
  value = module.ecs.service_name
}
