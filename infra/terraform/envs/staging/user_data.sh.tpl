#!/bin/bash
set -ex

# Log output to file
exec > >(tee /var/log/user-data.log) 2>&1

echo "=== Starting deployment at $(date) ==="
echo "=== Deploy version: ${deploy_version} ==="

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Install jq for JSON parsing
yum install -y jq

# Install PM2 globally
npm install -g pm2

# Create app directory
APP_DIR=/home/ec2-user/holoplax
mkdir -p $APP_DIR

# Download app from S3
aws s3 cp s3://${s3_bucket}/deploy/holoplax-app.tar.gz /home/ec2-user/holoplax-app.tar.gz
tar -xzf /home/ec2-user/holoplax-app.tar.gz -C $APP_DIR

# Get secrets from Secrets Manager
DB_SECRET=$(aws secretsmanager get-secret-value --region ${region} --secret-id ${db_secret_name} --query SecretString --output text)
DB_HOST=$(echo $DB_SECRET | jq -r '.host')
DB_USER=$(echo $DB_SECRET | jq -r '.username')
DB_PASS=$(echo $DB_SECRET | jq -r '.password')
DB_NAME=$(echo $DB_SECRET | jq -r '.dbname')

OPENAI_SECRET=$(aws secretsmanager get-secret-value --region ${region} --secret-id ${openai_secret_name} --query SecretString --output text 2>/dev/null || echo '{}')
OPENAI_API_KEY=$(echo $OPENAI_SECRET | jq -r '.api_key // empty')

# Install cron + uv for daily metrics job
yum install -y cronie
sudo -u ec2-user bash -lc "curl -LsSf https://astral.sh/uv/install.sh | sh"
sudo -u ec2-user bash -lc "/home/ec2-user/.local/bin/uv python install 3.11"

# Create .env file
cat > $APP_DIR/.env << EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:5432/$DB_NAME
NEXTAUTH_URL=${nextauth_url}
NEXTAUTH_SECRET=$(openssl rand -base64 32)
OPENAI_API_KEY=$OPENAI_API_KEY
S3_BUCKET=${s3_bucket}
AWS_REGION=${region}
EOF

# Create metrics runner and schedule daily job
mkdir -p $APP_DIR/scripts/metrics
cat > $APP_DIR/scripts/metrics/run_metrics.sh << 'EOF'
#!/bin/bash
set -euo pipefail

set -a
source /home/ec2-user/holoplax/.env
set +a

export PATH="/home/ec2-user/.local/bin:$PATH"

cd /home/ec2-user/holoplax/scripts/metrics
exec /home/ec2-user/.local/bin/uv run --project /home/ec2-user/holoplax/scripts/metrics --python 3.11 python metrics_job.py
EOF
chmod +x $APP_DIR/scripts/metrics/run_metrics.sh

cat > /etc/cron.d/holoplax-metrics << EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/home/ec2-user/.local/bin
15 3 * * * ec2-user $APP_DIR/scripts/metrics/run_metrics.sh >> /var/log/holoplax-metrics.log 2>&1
EOF
systemctl enable --now crond

# Set ownership
chown -R ec2-user:ec2-user $APP_DIR

# Install dependencies
cd $APP_DIR
sudo -u ec2-user npm install

# Generate Prisma client
sudo -u ec2-user npx prisma generate

# Run database migrations
sudo -u ec2-user npx prisma migrate deploy

# Start application with PM2
sudo -u ec2-user pm2 delete holoplax 2>/dev/null || true
sudo -u ec2-user pm2 start npm --name holoplax -- start
sudo -u ec2-user pm2 save

# Setup PM2 to start on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user

echo "=== Deployment completed at $(date) ==="
