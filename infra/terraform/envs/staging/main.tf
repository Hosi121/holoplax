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
  enable_s3_access      = true

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

resource "random_id" "encryption_key" {
  byte_length = 32
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    nextauth_secret = random_password.nextauth_secret.result
    encryption_key  = random_id.encryption_key.hex
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

# =============================================================================
# MCP Server Infrastructure
# =============================================================================

module "ecr_mcp" {
  source = "../../modules/ecr"

  repository_name = "${var.name_prefix}-mcp"
}

locals {
  ecr_mcp_url = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.name_prefix}-mcp"
  mcp_port    = 3001
}

# CloudWatch Log Group for MCP
resource "aws_cloudwatch_log_group" "mcp" {
  name              = "/ecs/${var.name_prefix}/mcp"
  retention_in_days = 30
}

# Target Group for MCP
resource "aws_lb_target_group" "mcp" {
  name        = "${var.name_prefix}-mcp-tg"
  port        = local.mcp_port
  protocol    = "HTTP"
  vpc_id      = module.network.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }
}

# ALB Listener Rule for MCP (route /mcp and /health to MCP service)
resource "aws_lb_listener_rule" "mcp" {
  listener_arn = module.alb.https_listener_arn != null ? module.alb.https_listener_arn : module.alb.http_listener_arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp.arn
  }

  condition {
    path_pattern {
      values = ["/mcp", "/mcp/*", "/health"]
    }
  }
}

# Security Group for MCP ECS tasks
resource "aws_security_group" "mcp" {
  name        = "${var.name_prefix}-mcp-sg"
  description = "MCP ECS tasks security group"
  vpc_id      = module.network.vpc_id

  ingress {
    from_port       = local.mcp_port
    to_port         = local.mcp_port
    protocol        = "tcp"
    security_groups = [module.alb.security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-mcp-sg"
  }
}

# Allow MCP to access RDS
resource "aws_security_group_rule" "mcp_to_rds" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.mcp.id
  security_group_id        = module.rds.security_group_id
}

# MCP Task Definition
resource "aws_ecs_task_definition" "mcp" {
  family                   = "${var.name_prefix}-mcp"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = module.ecs.task_execution_role_arn
  task_role_arn            = module.ecs.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "mcp"
      image     = "${module.ecr_mcp.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = local.mcp_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "MCP_TRANSPORT", value = "http" },
        { name = "MCP_PORT", value = tostring(local.mcp_port) },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.db.arn}:database_url::" },
        { name = "NEXTAUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:nextauth_secret::" },
        { name = "ENCRYPTION_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:encryption_key::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.mcp.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "mcp"
        }
      }
      # Note: Container health check removed - ALB target group health check is sufficient
    }
  ])

  tags = {
    Name = "${var.name_prefix}-mcp"
  }
}

# MCP ECS Service
resource "aws_ecs_service" "mcp" {
  name            = "${var.name_prefix}-mcp"
  cluster         = module.ecs.cluster_id
  task_definition = aws_ecs_task_definition.mcp.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 120

  network_configuration {
    subnets          = module.network.public_subnet_ids
    security_groups  = [aws_security_group.mcp.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp.arn
    container_name   = "mcp"
    container_port   = local.mcp_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = {
    Name = "${var.name_prefix}-mcp"
  }
}

output "ecr_mcp_repository_url" {
  value = module.ecr_mcp.repository_url
}

output "mcp_service_name" {
  value = aws_ecs_service.mcp.name
}
