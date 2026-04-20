# ECS Microservices Learning Project

MERN microservices app for learning **AWS ECS**. Frontend calls each microservice directly — no API Gateway middleware. Services call each other for inter-service communication.

## Architecture

```
Frontend (Next.js :3000) ──→ user-service :4001 ←→ order-service :4003
                          ──→ product-service :4002 ←→ order-service :4003
                          ──→ order-service :4003 ←→ user-service + product-service

All services → MongoDB :27017
```

**No API Gateway** — in production, use **AWS ALB** or **AWS API Gateway** to route traffic.

## Services

| Service | Port | Calls | Database |
|---------|------|-------|----------|
| **Frontend** (Next.js) | 3000 | All 3 services directly | — |
| **User Service** | 4001 | order-service | `userdb` |
| **Product Service** | 4002 | order-service | `productdb` |
| **Order Service** | 4003 | user-service, product-service | `orderdb` |
| **MongoDB** | 27017 | — | — |

## Quick Start

```bash
# 1. Start everything
docker compose up --build

# 2. Open dashboard
open http://localhost:3000

# 3. Test flow
# Create users → Create products → Place orders → Watch Traffic tab!
```

### Local dev (without Docker)

```bash
# Terminal 1: MongoDB (or use Docker)
docker run -d -p 27017:27017 mongo:7

# Terminal 2-4: Start each service
cd user-service && npm install && npm run dev
cd product-service && npm install && npm run dev
cd order-service && npm install && npm run dev

# Terminal 5: Frontend
cd frontend && npm install && npm run dev
```

## Environment Variables

See [demo.env](demo.env) for all variables. The frontend reads from `.env.local`:

```env
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:4001
NEXT_PUBLIC_PRODUCT_SERVICE_URL=http://localhost:4002
NEXT_PUBLIC_ORDER_SERVICE_URL=http://localhost:4003
```

## API Endpoints

```bash
# Health
curl http://localhost:4001/health
curl http://localhost:4002/health
curl http://localhost:4003/health

# Traffic logs (per service)
curl http://localhost:4001/traffic
curl http://localhost:4002/traffic
curl http://localhost:4003/traffic

# CRUD
curl http://localhost:4001/api/users
curl http://localhost:4002/api/products
curl http://localhost:4003/api/orders
```

## Project Structure

```
ECS_TESTING/
├── docker-compose.yml
├── demo.env                     # All environment variables
├── ECS_DEPLOY.md                # Full ECS deployment guide
├── README.md
├── shared/trafficLogger.js      # Request tracing (copied into each service)
├── frontend/                    # Next.js dashboard
│   ├── Dockerfile
│   ├── next.config.js
│   ├── app/
│   │   ├── layout.js
│   │   ├── globals.css
│   │   └── page.js              # Main dashboard (all panels)
│   └── lib/api.js               # Direct service API calls
├── user-service/
│   ├── Dockerfile
│   └── src/
│       ├── index.js
│       ├── trafficLogger.js
│       ├── models/User.js
│       └── routes/userRoutes.js # → order-service for profile/delete
├── product-service/
│   ├── Dockerfile
│   └── src/
│       ├── index.js
│       ├── trafficLogger.js
│       ├── models/Product.js
│       └── routes/productRoutes.js  # → order-service for stats/delete
└── order-service/
    ├── Dockerfile
    └── src/
        ├── index.js
        ├── trafficLogger.js
        ├── models/Order.js
        └── routes/orderRoutes.js    # → user-service + product-service
```

## Deploy to AWS ECS

See **[ECS_DEPLOY.md](ECS_DEPLOY.md)** for the complete step-by-step deployment guide.

## Useful Commands

```bash
docker compose up --build -d     # Build and start all (detached)
docker compose logs -f order-service  # Follow logs
docker compose down              # Stop all
docker compose down -v           # Stop + remove volumes
```
# E-COMMERCE_Microservices
