variable "region" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnet_cidrs" {
  type = list(string)
}

variable "private_subnet_cidrs" {
  type = list(string)
}

variable "app_port" {
  type = number
}

variable "db_instance_class" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "db_multi_az" {
  type = bool
}

variable "bucket_name" {
  type = string
}

variable "public_read" {
  type    = bool
  default = true
}

variable "db_password_override" {
  type      = string
  default   = ""
  sensitive = true
}

variable "app_domain" {
  type        = string
  default     = ""
  description = "Custom domain for the application"
}

variable "ecs_cpu" {
  type        = number
  default     = 256
  description = "CPU units for ECS task"
}

variable "ecs_memory" {
  type        = number
  default     = 512
  description = "Memory (MB) for ECS task"
}

variable "ecs_desired_count" {
  type        = number
  default     = 1
  description = "Desired number of ECS tasks"
}
