# Production-like Docker test stack

Postgres + SeaweedFS (S3-compatible stand-in for R2) + the real `web` and `worker` images.
All credentials here are throwaway test values.

```bash
docker build -t dear-web-test --build-arg CSP_EXTRA_MEDIA_ORIGINS=http://localhost:9000 -f Dockerfile .
docker build -t dear-worker -f Dockerfile.worker .
cd tests/docker
docker compose -p dearstack up -d postgres s3
echo "s3.bucket.create -name dear-swritsinh-media" | docker compose -p dearstack exec -T s3 weed shell
docker compose -p dearstack run --rm web pnpm db:migrate
docker compose -p dearstack run --rm -e OWNER_EMAIL=owner@example.test -e OWNER_PASSWORD=e2e-owner-password-123 web pnpm owner:bootstrap
docker compose -p dearstack up -d web worker
cd ../.. && E2E_BASE_URL=http://localhost:3400 pnpm test:e2e
docker compose -p dearstack -f tests/docker/compose.yml down
```

`web` and `worker` share the storage container's network so that the browser and the
containers reach S3 at the same `localhost:9000` address (needed for signed URLs).
