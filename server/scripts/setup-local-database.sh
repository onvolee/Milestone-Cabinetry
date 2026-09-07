#!/bin/sh

set -eu

compose() {
  docker compose --env-file .env.local -f docker-compose.db.yml "$@"
}

compose up -d --wait
compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file /docker-entrypoint-initdb.d/01-roles.sql'
