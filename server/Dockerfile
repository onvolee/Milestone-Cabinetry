FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

COPY package.json yarn.lock ./

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn install --frozen-lockfile --non-interactive

COPY . .

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start"]
