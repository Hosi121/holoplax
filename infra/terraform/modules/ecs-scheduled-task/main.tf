resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name_prefix}/${var.task_name}"
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
  name               = "${var.name_prefix}-${var.task_name}-execution"
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
  name   = "${var.name_prefix}-${var.task_name}-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.secrets_access[0].json
}

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-${var.task_name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-${var.task_name}-sg"
  description = "Security group for ${var.task_name} scheduled task"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-${var.task_name}-sg"
  }
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name_prefix}-${var.task_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = var.task_name
      image     = var.container_image
      essential = true

      environment = var.environment_variables

      secrets = var.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = var.task_name
        }
      }
    }
  ])

  tags = {
    Name = "${var.name_prefix}-${var.task_name}"
  }
}

data "aws_iam_policy_document" "eventbridge_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge" {
  name               = "${var.name_prefix}-${var.task_name}-eventbridge"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume_role.json
}

data "aws_iam_policy_document" "eventbridge_ecs" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = [aws_ecs_task_definition.this.arn]
  }

  statement {
    actions   = ["iam:PassRole"]
    resources = [
      aws_iam_role.task_execution.arn,
      aws_iam_role.task.arn,
    ]
  }
}

resource "aws_iam_role_policy" "eventbridge_ecs" {
  name   = "${var.name_prefix}-${var.task_name}-eventbridge-ecs"
  role   = aws_iam_role.eventbridge.id
  policy = data.aws_iam_policy_document.eventbridge_ecs.json
}

resource "aws_cloudwatch_event_rule" "this" {
  name                = "${var.name_prefix}-${var.task_name}"
  description         = "Schedule for ${var.task_name}"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "this" {
  rule     = aws_cloudwatch_event_rule.this.name
  arn      = var.cluster_arn
  role_arn = aws_iam_role.eventbridge.arn

  ecs_target {
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.this.arn
    launch_type         = "FARGATE"

    network_configuration {
      subnets          = var.subnet_ids
      security_groups  = [aws_security_group.this.id]
      assign_public_ip = true
    }
  }
}
