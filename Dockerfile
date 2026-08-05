# Build Stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Run Stage
FROM node:20-alpine
WORKDIR /app
RUN npm install express http-proxy-middleware
COPY --from=build /app/dist ./dist
COPY server.js ./
EXPOSE 80
CMD ["node", "server.js"]
