variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
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
  description = "Subnet IDs for ECS tasks"
}

variable "alb_security_group_id" {
  type        = string
  description = "ALB security group ID"
}

variable "target_group_arn" {
  type        = string
  description = "Target group ARN for load balancer"
}

variable "container_image" {
  type        = string
  description = "Container image URL"
}

variable "container_port" {
  type        = number
  default     = 3000
  description = "Container port"
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

variable "desired_count" {
  type        = number
  default     = 1
  description = "Desired number of tasks"
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

variable "s3_bucket_arn" {
  type        = string
  default     = null
  description = "S3 bucket ARN for task role permissions"
}
