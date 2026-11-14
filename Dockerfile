FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts/ scripts/
COPY worker/ worker/
COPY ui/ ui/
COPY assets/ assets/
COPY data/ data/
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 GUILD_DATABASE_PATH=/data/chipstuttarna.sqlite
RUN mkdir /data && chown node:node /data
COPY package.json ./
COPY --from=build /app/dist/server/ dist/server/
COPY drizzle/ drizzle/
COPY server/ server/
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
