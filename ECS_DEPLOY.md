# Deploying to AWS ECS — Step-by-Step Guide

This guide walks you through deploying all 5 services (frontend + 3 microservices + MongoDB) to **AWS ECS on Fargate**.

---

## Prerequisites

- **AWS CLI** installed and configured (`aws configure`)
- **Docker** installed locally
- AWS account with permissions for ECS, ECR, VPC, ALB, Cloud Map, IAM
- All services build and run locally with `docker compose up --build`

---

## Architecture on ECS

```
Internet
   │
   ▼
┌──────────────────────────────┐
│  Application Load Balancer   │
│  (ALB)                       │
│  ┌────────────────────────┐  │
│  │ Path-based routing:    │  │
│  │ /*             → frontend │
│  │ /user-service/* → user  │  │
│  │ /product-service/* → product │
│  │ /order-service/* → order │  │
│  └────────────────────────┘  │
└──────────┬───────────────────┘
           │
┌──────────▼───────────────────────────────────────────┐
│              AWS ECS Cluster (Fargate)                │
│                                                       │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│  │ user-svc  │ │product-svc│ │ order-svc │          │
│  │ Task:4001 │ │ Task:4002 │ │ Task:4003 │          │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘          │
│        │              │              │                │
│        └──────────────┼──────────────┘                │
│  Inter-service via Cloud Map (*.ecs-learning.local)   │
│                       │                               │
│              ┌────────▼─────────┐                     │
│              │  DocumentDB or   │                     │
│              │  MongoDB on ECS  │                     │
│              └──────────────────┘                     │
│                                                       │
│  ┌──────────┐                                         │
│  │ Frontend │  (Next.js standalone, port 3000)        │
│  │ Task     │                                         │
│  └──────────┘                                         │
└───────────────────────────────────────────────────────┘
```

---

## Step 1: Set Environment Variables

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
export CLUSTER_NAME=ecs-learning-cluster
```

---

## Step 2: Create ECR Repositories

```bash
for service in frontend user-service product-service order-service; do
  aws ecr create-repository \
    --repository-name ecs-learning/$service \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true
  echo "Created: ecs-learning/$service"
done
```

---

## Step 3: Build & Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

# Build and push backend services
for service in user-service product-service order-service; do
  echo "Building $service..."
  docker build -t ecs-learning/$service ./$service
  docker tag ecs-learning/$service:latest $ECR_REGISTRY/ecs-learning/$service:latest
  docker push $ECR_REGISTRY/ecs-learning/$service:latest
done

# Build and push frontend (replace ALB_DNS with your actual ALB DNS after Step 8)
export ALB_DNS="YOUR_ALB_DNS_HERE"
docker build -t ecs-learning/frontend ./frontend \
  --build-arg NEXT_PUBLIC_USER_SERVICE_URL=http://$ALB_DNS/user-service \
  --build-arg NEXT_PUBLIC_PRODUCT_SERVICE_URL=http://$ALB_DNS/product-service \
  --build-arg NEXT_PUBLIC_ORDER_SERVICE_URL=http://$ALB_DNS/order-service
docker tag ecs-learning/frontend:latest $ECR_REGISTRY/ecs-learning/frontend:latest
docker push $ECR_REGISTRY/ecs-learning/frontend:latest
```

> **Note:** You'll need to rebuild & push the frontend after creating the ALB (Step 8) to set the correct URLs.

---

## Step 4: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $AWS_REGION
```

---

## Step 5: Create Task Execution Role

```bash
# Create role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

---

## Step 6: Set Up Service Discovery (Cloud Map)

```bash
# Create private DNS namespace
NAMESPACE_ID=$(aws servicediscovery create-private-dns-namespace \
  --name ecs-learning.local \
  --vpc YOUR_VPC_ID \
  --region $AWS_REGION \
  --query 'OperationId' --output text)

# Wait for namespace creation, then get the namespace ID
# aws servicediscovery get-operation --operation-id $NAMESPACE_ID

# Create discovery service for each microservice
for svc in user-service product-service order-service; do
  aws servicediscovery create-service \
    --name $svc \
    --dns-config "NamespaceId=YOUR_NAMESPACE_ID,DnsRecords=[{Type=A,TTL=10}]" \
    --health-check-custom-config FailureThreshold=1
done
```

---

## Step 7: Create Task Definitions

### user-service

```bash
cat > /tmp/task-user-service.json << 'EOF'
{
  "family": "user-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "user-service",
    "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/ecs-learning/user-service:latest",
    "portMappings": [{"containerPort": 4001, "protocol": "tcp"}],
    "environment": [
      {"name": "PORT", "value": "4001"},
      {"name": "MONGO_URI", "value": "mongodb://YOUR_MONGO_HOST:27017/userdb"},
      {"name": "ORDER_SERVICE_URL", "value": "http://order-service.ecs-learning.local:4003"}
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:4001/health || exit 1"],
      "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 15
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/user-service",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

# Replace placeholders
sed -i '' "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g; s/REGION/$AWS_REGION/g" /tmp/task-user-service.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-user-service.json
```

### product-service

```bash
cat > /tmp/task-product-service.json << 'EOF'
{
  "family": "product-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "product-service",
    "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/ecs-learning/product-service:latest",
    "portMappings": [{"containerPort": 4002, "protocol": "tcp"}],
    "environment": [
      {"name": "PORT", "value": "4002"},
      {"name": "MONGO_URI", "value": "mongodb://YOUR_MONGO_HOST:27017/productdb"},
      {"name": "ORDER_SERVICE_URL", "value": "http://order-service.ecs-learning.local:4003"}
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:4002/health || exit 1"],
      "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 15
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/product-service",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

sed -i '' "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g; s/REGION/$AWS_REGION/g" /tmp/task-product-service.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-product-service.json
```

### order-service

```bash
cat > /tmp/task-order-service.json << 'EOF'
{
  "family": "order-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "order-service",
    "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/ecs-learning/order-service:latest",
    "portMappings": [{"containerPort": 4003, "protocol": "tcp"}],
    "environment": [
      {"name": "PORT", "value": "4003"},
      {"name": "MONGO_URI", "value": "mongodb://YOUR_MONGO_HOST:27017/orderdb"},
      {"name": "USER_SERVICE_URL", "value": "http://user-service.ecs-learning.local:4001"},
      {"name": "PRODUCT_SERVICE_URL", "value": "http://product-service.ecs-learning.local:4002"}
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:4003/health || exit 1"],
      "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 15
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/order-service",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

sed -i '' "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g; s/REGION/$AWS_REGION/g" /tmp/task-order-service.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-order-service.json
```

### frontend

```bash
cat > /tmp/task-frontend.json << 'EOF'
{
  "family": "frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "frontend",
    "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/ecs-learning/frontend:latest",
    "portMappings": [{"containerPort": 3000, "protocol": "tcp"}],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/ || exit 1"],
      "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 15
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/frontend",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

sed -i '' "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g; s/REGION/$AWS_REGION/g" /tmp/task-frontend.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-frontend.json
```

---

## Step 8: Create Application Load Balancer

```bash
export VPC_ID=YOUR_VPC_ID
export SUBNET_1=YOUR_SUBNET_1
export SUBNET_2=YOUR_SUBNET_2
export SG_ID=YOUR_SECURITY_GROUP

# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name ecs-learning-alb \
  --subnets $SUBNET_1 $SUBNET_2 \
  --security-groups $SG_ID \
  --scheme internet-facing \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB DNS: $ALB_DNS"

# Create target groups
for svc_port in "frontend:3000" "user-service:4001" "product-service:4002" "order-service:4003"; do
  IFS=: read svc port <<< "$svc_port"
  aws elbv2 create-target-group \
    --name tg-$svc \
    --protocol HTTP \
    --port $port \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /health \
    --health-check-interval-seconds 30
done

# Create default listener (routes to frontend)
FRONTEND_TG=$(aws elbv2 describe-target-groups --names tg-frontend \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG \
  --query 'Listeners[0].ListenerArn' --output text)

# Add path-based rules for microservices
for svc in user-service product-service order-service; do
  TG_ARN=$(aws elbv2 describe-target-groups --names tg-$svc \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

  aws elbv2 create-rule \
    --listener-arn $LISTENER_ARN \
    --conditions Field=path-pattern,Values="/$svc/*" \
    --actions Type=forward,TargetGroupArn=$TG_ARN \
    --priority $((RANDOM % 900 + 1))
done
```

> **After ALB is created:** Rebuild the frontend with the correct `ALB_DNS` and push again (Step 3).

---

## Step 9: Create ECS Services

```bash
for svc in user-service product-service order-service frontend; do
  TG_ARN=$(aws elbv2 describe-target-groups --names tg-$svc \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

  CONTAINER_PORT=3000
  [[ $svc == "user-service" ]] && CONTAINER_PORT=4001
  [[ $svc == "product-service" ]] && CONTAINER_PORT=4002
  [[ $svc == "order-service" ]] && CONTAINER_PORT=4003

  aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $svc \
    --task-definition $svc \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=$svc,containerPort=$CONTAINER_PORT"

  echo "Created ECS service: $svc"
done
```

---

## Step 10: Set Up MongoDB

### Option A: MongoDB on ECS (for learning)

```bash
# Create a task definition for MongoDB
cat > /tmp/task-mongo.json << 'EOF'
{
  "family": "mongo",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "mongo",
    "image": "mongo:7",
    "portMappings": [{"containerPort": 27017, "protocol": "tcp"}],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/mongo",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

sed -i '' "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g; s/REGION/$AWS_REGION/g" /tmp/task-mongo.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-mongo.json

# Create service with service discovery
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name mongo \
  --task-definition mongo \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=DISABLED}" \
  --service-registries "registryArn=YOUR_MONGO_SERVICE_DISCOVERY_ARN"
```

Then update `MONGO_URI` in task definitions to: `mongodb://mongo.ecs-learning.local:27017/dbname`

### Option B: Amazon DocumentDB (recommended for production)

```bash
aws docdb create-db-cluster \
  --db-cluster-identifier ecs-learning-db \
  --engine docdb \
  --master-username admin \
  --master-user-password YOUR_PASSWORD \
  --vpc-security-group-ids $SG_ID \
  --db-subnet-group-name YOUR_SUBNET_GROUP
```

Then update `MONGO_URI` to the DocumentDB connection string.

---

## Verify Deployment

```bash
# Check services
aws ecs list-services --cluster $CLUSTER_NAME

# Check running tasks
aws ecs list-tasks --cluster $CLUSTER_NAME --service-name user-service

# Check task health
aws ecs describe-tasks --cluster $CLUSTER_NAME \
  --tasks $(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name user-service --query 'taskArns[0]' --output text)

# View logs
aws logs tail /ecs/user-service --follow
aws logs tail /ecs/order-service --follow

# Test via ALB
curl http://$ALB_DNS/user-service/health
curl http://$ALB_DNS/product-service/health
curl http://$ALB_DNS/order-service/health
curl http://$ALB_DNS/  # Frontend
```

---

## Scaling

```bash
# Scale a service
aws ecs update-service --cluster $CLUSTER_NAME --service user-service --desired-count 3

# Auto-scaling (target tracking on CPU)
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/$CLUSTER_NAME/user-service \
  --min-capacity 1 \
  --max-capacity 5

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/$CLUSTER_NAME/user-service \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"}
  }'
```

---

## Cleanup

```bash
# Delete services
for svc in frontend user-service product-service order-service mongo; do
  aws ecs update-service --cluster $CLUSTER_NAME --service $svc --desired-count 0 2>/dev/null
  aws ecs delete-service --cluster $CLUSTER_NAME --service $svc --force 2>/dev/null
done

# Delete cluster
aws ecs delete-cluster --cluster $CLUSTER_NAME

# Delete ALB
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN

# Delete target groups
for svc in frontend user-service product-service order-service; do
  TG=$(aws elbv2 describe-target-groups --names tg-$svc --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null)
  aws elbv2 delete-target-group --target-group-arn $TG 2>/dev/null
done

# Delete ECR repos
for service in frontend user-service product-service order-service; do
  aws ecr delete-repository --repository-name ecs-learning/$service --force
done

# Delete Cloud Map namespace
aws servicediscovery delete-namespace --id YOUR_NAMESPACE_ID

echo "Cleanup complete!"
```

---

## Security Group Rules

Make sure your security group allows:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| HTTP | 80 | 0.0.0.0/0 | ALB (public) |
| Custom TCP | 3000 | SG self | Frontend |
| Custom TCP | 4001 | SG self | User service |
| Custom TCP | 4002 | SG self | Product service |
| Custom TCP | 4003 | SG self | Order service |
| Custom TCP | 27017 | SG self | MongoDB |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Task keeps restarting | Check `aws logs tail /ecs/SERVICE_NAME` for errors |
| Services can't find each other | Verify Cloud Map namespace & service discovery |
| Health checks failing | Ensure security group allows traffic between tasks |
| Frontend shows errors | Rebuild with correct `ALB_DNS` and push again |
| MONGO_URI connection refused | Check MongoDB task is running & security group allows 27017 |
