variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
}

variable "task_name" {
  type        = string
  description = "Name of the scheduled task"
}

variable "region" {
  type        = string
  description = "AWS region"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for the task"
}

variable "cluster_arn" {
  type        = string
  description = "ECS cluster ARN"
}

variable "container_image" {
  type        = string
  description = "Container image URL"
}

variable "schedule_expression" {
  type        = string
  description = "CloudWatch Events schedule expression (e.g., 'rate(1 day)' or 'cron(0 9 * * ? *)')"
}

variable "cpu" {
  type        = number
  default     = 256
  description = "CPU units for the task"
}

variable "memory" {
  type        = number
  default     = 512
  description = "Memory (MB) for the task"
}

variable "environment_variables" {
  type = list(object({
    name  = string
    value = string
  }))
  default     = []
  description = "Environment variables for the container"
}

variable "secrets" {
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default     = []
  description = "Secrets for the container"
}

variable "secrets_arns" {
  type        = list(string)
  default     = []
  description = "Secret ARNs for IAM permissions"
}
