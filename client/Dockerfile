FROM node:22-alpine AS build
ARG VITE_GOOGLE_MAPS_API_KEY
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/
RUN npm ci -w client --include-workspace-root
COPY . .
RUN VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY npm run build -w client

FROM nginx:alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
