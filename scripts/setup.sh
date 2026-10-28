#!/bin/sh
set -eu
umask 077
if [ -e .env ]; then
  if ! grep -q '^POSTGRES_PASSWORD=' .env; then
    printf '\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" >> .env
    echo 'Added POSTGRES_PASSWORD. Existing credentials and encryption key were preserved.'
  else
    echo '.env already exists; kept existing credentials.'
  fi
  exit 0
fi
umask 077
# noclobber prevents replacing another setup process's newly created file.
set -C
{
  printf 'ADMIN_TOKEN=%s\n' "$(openssl rand -hex 32)"
  printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'PUBLIC_URL=http://localhost:7001\nPORT=7001\nDATA_DIR=./data\n'
} > .env
echo 'Created .env. Set PUBLIC_URL to your Pangolin HTTPS address before remote deployment.'
