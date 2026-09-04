FROM node:22-alpine AS base

WORKDIR /app

FROM base AS build

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --non-interactive

COPY tsconfig.json ./
COPY src ./src

RUN yarn build

FROM base AS runtime

ENV NODE_ENV=staging
ENV PORT=3001

COPY package.json yarn.lock ./

RUN yarn install \
    --frozen-lockfile \
    --production=true \
    --non-interactive \
    && yarn cache clean

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3001

CMD ["node", "dist/server.js"]
