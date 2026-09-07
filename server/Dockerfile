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
COPY --chown=node:node .certs/rds-global-bundle.pem ./.certs/rds-global-bundle.pem

USER node

EXPOSE 3001

CMD ["node", "dist/server.js"]

FROM runtime AS db-bootstrap

USER root

RUN apk add --no-cache postgresql-client

COPY .certs/rds-global-bundle.pem /certs/rds-global-bundle.pem
COPY db/bootstrap/01-rds-roles.sql /bootstrap/01-rds-roles.sql
COPY db/bootstrap/run.mjs /app/bootstrap/run.mjs

ENV PGSSLMODE=verify-full
ENV PGSSLROOTCERT=/certs/rds-global-bundle.pem

USER node

ENTRYPOINT ["node", "/app/bootstrap/run.mjs"]
