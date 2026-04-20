# CI/CD Pipeline — Deploy to Single EC2

This pipeline builds Docker images, pushes to ECR, then SSHs into an EC2 instance to pull and run each container individually (**no docker-compose**).

---

## Pipeline Flow

```
Manual Trigger (workflow_dispatch)
        │
        ▼
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. TEST     │────▶│  2. BUILD & PUSH │────▶│  3. DEPLOY (SSH) │
│  npm ci      │     │  docker build    │     │  docker pull     │
│  npm test    │     │  docker push ECR │     │  docker run      │
│  (parallel)  │     │  (parallel x4)   │     │  health checks   │
└─────────────┘     └──────────────────┘     └──────────────────┘
```

---

## Prerequisites

### 1. EC2 Instance Setup

SSH into your EC2 and run:

```bash
# Amazon Linux 2023 / AL2
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install AWS CLI (if not pre-installed)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Configure AWS CLI (for ECR login)
aws configure
# Enter your Access Key, Secret Key, Region

# Logout and login again for docker group to take effect
exit
```

### 2. Security Group

Open these ports on your EC2 security group:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP / GitHub Actions IPs | SSH |
| 3000 | TCP | 0.0.0.0/0 | Frontend |
| 4001 | TCP | 0.0.0.0/0 | User Service |
| 4002 | TCP | 0.0.0.0/0 | Product Service |
| 4003 | TCP | 0.0.0.0/0 | Order Service |

### 3. Create ECR Repositories

```bash
export AWS_REGION=us-east-1

for service in frontend user-service product-service order-service; do
  aws ecr create-repository \
    --repository-name ecs-learning/$service \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true
done
```

### 4. GitHub Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value | Example |
|--------|-------|---------|
| `AWS_ACCESS_KEY_ID` | IAM access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key | `wJal...` |
| `EC2_HOST` | EC2 public IP or DNS | `54.123.45.67` |
| `EC2_SSH_PRIVATE_KEY` | Full PEM key content | `-----BEGIN RSA PRIVATE KEY-----\n...` |

And these **Variables** (Settings → Variables):

| Variable | Value |
|----------|-------|
| `AWS_ACCOUNT_ID` | `123456789012` |
| `AWS_REGION` | `us-east-1` |

Optional secrets (defaults to localhost MongoDB):

| Secret | Value |
|--------|-------|
| `EC2_USER` | `ec2-user` (default) |
| `MONGO_URI_USER` | Custom MongoDB URI for users |
| `MONGO_URI_PRODUCT` | Custom MongoDB URI for products |
| `MONGO_URI_ORDER` | Custom MongoDB URI for orders |

---

## Running the Pipeline

1. Go to **Actions** tab in GitHub
2. Select **"Build, Push ECR & Deploy to EC2"**
3. Click **"Run workflow"**
4. Choose environment and whether to skip tests
5. Click **"Run workflow"** (green button)

---

## What Happens on EC2

The deploy step SSHs into EC2 and runs these `docker run` commands (no docker-compose):

```
ecs-mongo          → mongo:7 on port 27017
ecs-user-service   → ECR image on port 4001
ecs-product-service→ ECR image on port 4002
ecs-order-service  → ECR image on port 4003
ecs-frontend       → ECR image on port 3000
```

All containers join a `ecs-network` Docker bridge network so they can communicate by container name.

---

## Manual EC2 Commands (Debug / Ad-hoc)

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@YOUR_EC2_IP

# Check running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ecs-

# View logs
docker logs -f ecs-order-service
docker logs -f ecs-frontend

# Restart a service
docker restart ecs-user-service

# Stop everything
for c in ecs-frontend ecs-order-service ecs-product-service ecs-user-service ecs-mongo; do
  docker stop $c && docker rm $c
done

# Clean up
docker network rm ecs-network
docker volume rm mongo-data
docker system prune -af
```

---

## IAM Policy (Minimum Required)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
```
