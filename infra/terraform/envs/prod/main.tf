terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "holoplax-terraform-state"
    key            = "prod/terraform.tfstate"
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

locals {
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
  db_password = var.db_password_override != "" ? var.db_password_override : random_password.db.result
  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    region             = var.region
    s3_bucket          = var.bucket_name
    db_secret_name     = "${var.name_prefix}-db-secret"
    openai_secret_name = "${var.name_prefix}-openai-secret"
    nextauth_url       = var.app_domain != "" ? "https://${var.app_domain}" : "http://${module.alb.dns_name}"
    deploy_version     = var.deploy_version
  })
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

module "alb" {
  source = "../../modules/alb"

  name_prefix           = var.name_prefix
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  app_port              = var.app_port
  certificate_arn       = var.certificate_arn
  enable_https_redirect = var.enable_https_redirect
}

module "s3" {
  source = "../../modules/s3"

  name_prefix = var.name_prefix
  bucket_name = var.bucket_name
  public_read = var.public_read
}

module "ec2" {
  source = "../../modules/ec2"

  name_prefix            = var.name_prefix
  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  app_port               = var.app_port
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  user_data              = local.user_data
  alb_security_group_id  = module.alb.security_group_id
  target_group_arn       = module.alb.target_group_arn
  enable_alb             = true
  s3_bucket_arn          = module.s3.bucket_arn
  enable_s3_access       = true
  secrets_arns           = [aws_secretsmanager_secret.db.arn, aws_secretsmanager_secret.openai.arn]
}

module "rds" {
  source = "../../modules/rds"

  name_prefix          = var.name_prefix
  vpc_id               = module.network.vpc_id
  private_subnet_ids   = module.network.private_subnet_ids
  db_name              = var.db_name
  db_username          = var.db_username
  db_password          = local.db_password
  instance_class       = var.db_instance_class
  multi_az             = var.db_multi_az
  app_security_group_id = module.ec2.security_group_id
}

resource "aws_secretsmanager_secret" "db" {
  name = "${var.name_prefix}-db-secret"
}

resource "aws_secretsmanager_secret" "openai" {
  name = "${var.name_prefix}-openai-secret"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = local.db_password
    dbname   = var.db_name
    host     = module.rds.endpoint
    port     = 5432
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
