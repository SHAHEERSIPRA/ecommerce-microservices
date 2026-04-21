FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ✅ Build-time env vars (critical for Next.js)
ARG NEXT_PUBLIC_USER_SERVICE_URL
ARG NEXT_PUBLIC_PRODUCT_SERVICE_URL
ARG NEXT_PUBLIC_ORDER_SERVICE_URL

ENV NEXT_PUBLIC_USER_SERVICE_URL=${NEXT_PUBLIC_USER_SERVICE_URL}
ENV NEXT_PUBLIC_PRODUCT_SERVICE_URL=${NEXT_PUBLIC_PRODUCT_SERVICE_URL}
ENV NEXT_PUBLIC_ORDER_SERVICE_URL=${NEXT_PUBLIC_ORDER_SERVICE_URL}

# Debug (optional but powerful)
RUN echo "USER_SERVICE=$NEXT_PUBLIC_USER_SERVICE_URL" && \
    echo "PRODUCT_SERVICE=$NEXT_PUBLIC_PRODUCT_SERVICE_URL" && \
    echo "ORDER_SERVICE=$NEXT_PUBLIC_ORDER_SERVICE_URL"

RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
