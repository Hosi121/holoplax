resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.name_prefix}-cluster"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name_prefix}/app"
  retention_in_days = 30
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name_prefix}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "secrets_access" {
  count = length(var.secrets_arns) > 0 ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secrets_arns
  }
}

resource "aws_iam_role_policy" "secrets_access" {
  count  = length(var.secrets_arns) > 0 ? 1 : 0
  name   = "${var.name_prefix}-secrets-access"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.secrets_access[0].json
}

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

data "aws_iam_policy_document" "s3_access" {
  count = var.enable_s3_access ? 1 : 0

  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      var.s3_bucket_arn,
      "${var.s3_bucket_arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "s3_access" {
  count  = var.enable_s3_access ? 1 : 0
  name   = "${var.name_prefix}-s3-access"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.s3_access[0].json
}

resource "aws_security_group" "ecs" {
  name        = "${var.name_prefix}-ecs-sg"
  description = "ECS tasks security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-ecs-sg"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name_prefix}-app"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = var.environment_variables

      secrets = var.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "app"
        }
      }
      # Note: Container health check removed - ALB target group health check is sufficient
      # The wget healthCheck was causing issues with Next.js 16 standalone server
    }
  ])

  tags = {
    Name = "${var.name_prefix}-app"
  }
}

resource "aws_ecs_service" "app" {
  name            = "${var.name_prefix}-app"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = var.health_check_grace_period

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "app"
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = {
    Name = "${var.name_prefix}-app"
  }
}
