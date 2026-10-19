FROM node:24.11.1-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production
USER node
CMD ["node", "server.js"]
