FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_PUBLIC_SITE_ORIGIN=""
ARG VITE_ANALYTICS_ENABLED="false"
ENV VITE_PUBLIC_SITE_ORIGIN=${VITE_PUBLIC_SITE_ORIGIN}
ENV VITE_ANALYTICS_ENABLED=${VITE_ANALYTICS_ENABLED}
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
