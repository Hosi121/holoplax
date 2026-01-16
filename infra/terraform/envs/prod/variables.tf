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

variable "instance_type" {
  type = string
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

variable "ssh_key_name" {
  type    = string
  default = null
}

variable "user_data" {
  type    = string
  default = ""
}

variable "db_password_override" {
  type    = string
  default = ""
}
