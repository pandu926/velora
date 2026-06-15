FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY src/ ./src/
COPY data/ ./data/
COPY tsconfig.json ./
RUN npx tsc --noEmit false --outDir dist

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/data ./data/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/package.json ./
EXPOSE 8931
ENV PORT=8931
CMD ["node", "dist/index.js"]
