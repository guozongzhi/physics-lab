# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app

# 依赖层缓存：仅当 package*.json 变更才重装
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com

# 复制源码
COPY . .

# 构建期烘焙后端同源地址（浏览器访问的源）；改部署主机/端口用 build-arg 覆盖并重 build
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# 使用 `--base /`：nginx 在根路径托管 SPA，配合 BrowserRouter，
# 深层路由（如 /theory/topics、/teacher/overview）硬刷新时也能正确加载资源。
RUN npm run build -- --base=/

# ---- 运行阶段 ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
