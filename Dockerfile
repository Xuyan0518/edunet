FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
ENV VITE_API_URL=/api
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production API_PORT=3003 SERVE_WEB=true
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/src/domain ./src/domain
COPY --from=build /app/subjectCatalogs.json ./subjectCatalogs.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/.dev && chown node:node /app/.dev
EXPOSE 3003
USER node
CMD ["npm", "run", "start:api"]
