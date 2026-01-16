variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "app_port" {
  type = number
}

variable "instance_type" {
  type = string
}

variable "ami_id" {
  type    = string
  default = ""
}

variable "key_name" {
  type    = string
  default = null
}

variable "user_data" {
  type    = string
  default = ""
}

variable "alb_security_group_id" {
  type    = string
  default = null
}

variable "target_group_arn" {
  type    = string
  default = null
}

variable "s3_bucket_arn" {
  type    = string
  default = null
}

variable "secrets_arns" {
  type    = list(string)
  default = []
}
