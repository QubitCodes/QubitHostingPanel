# Runtime Images

Ghost Deploy publishes reusable `linux/amd64` application runtime images to GitHub Container Registry. Customer applications remain separate containers while sharing immutable base layers.

## Supported matrix

| Runtime | Version | GHCR image | Default port |
| --- | --- | --- | --- |
| Node.js | 22.23.1 | `ghcr.io/qubitcodes/runtime-node:22.23.1` | 3000 |
| Node.js | 24.18.0 | `ghcr.io/qubitcodes/runtime-node:24.18.0` | 3000 |
| PHP | 8.3.32 | `ghcr.io/qubitcodes/runtime-php:8.3.32` | 80 |
| PHP | 8.5.8 | `ghcr.io/qubitcodes/runtime-php:8.5.8` | 80 |
| Python | 3.12.13 | `ghcr.io/qubitcodes/runtime-python:3.12.13` | 8000 |
| Python | 3.13.14 | `ghcr.io/qubitcodes/runtime-python:3.13.14` | 8000 |
| Ruby | 3.4.10 | `ghcr.io/qubitcodes/runtime-ruby:3.4.10` | 3000 |
| Static/nginx | 1.30.4 | `ghcr.io/qubitcodes/runtime-static:1.30.4` | 80 |

Node.js `22.23.2` is not an upstream release, so the catalogue uses the latest verified Node.js 22 patch, `22.23.1`.

Node images pin npm 12.0.2, including patched `tar` 7.5.19, instead of retaining the vulnerable npm bundle shipped by the upstream runtime image.

PHP images contain nginx, PHP-FPM, Composer 2, PostgreSQL/MySQL drivers, and the common Laravel, WordPress, CakePHP, and Symfony extensions within the application container. Coolify's shared Traefik proxy remains the public ingress and routes traffic to port 80. Node.js, Python, and Ruby images intentionally provide only a runtime foundation; customer builds supply the application entrypoint.

## Publication policy

`.github/workflows/runtime-images.yml` builds and scans every image on pull requests. It publishes only from `main` or a manually dispatched workflow. Actions are pinned to immutable commit SHAs, and every published image includes provenance and an SBOM.

Published tags include:

- Exact version, such as `24.18.0`.
- Supported channel, such as `24` or `8.5`.
- Traceable channel and source revision, such as `24-sha-0123456789ab`.

Production deployments should resolve an approved exact tag to its registry digest and save the digest in `runtime_images.digest`. Channel tags are for controlled promotion, not permanent deployment references.

After the first workflow publication, make each `runtime-*` GHCR package public or configure Coolify with a read-only registry credential. Public base images are preferred because they contain no customer code or secrets.

## Local verification

Build a specific runtime from the repository root:

```bash
docker build --build-arg RUNTIME_VERSION=24.18.0 -t qubit-runtime-node:24.18.0 runtimes/node
docker run --rm qubit-runtime-node:24.18.0 node --version
```

Apply the same pattern to the PHP, Python, and static contexts using a version from the supported matrix.

## Updating a runtime

1. Verify that the upstream image/version exists and supports `linux/amd64`.
2. Update the workflow matrix and essential-data runtime seed together.
3. Open a pull request and allow all builds, smoke tests, and vulnerability scans to pass.
4. Merge to `main`, confirm the GHCR digest, and record it in the runtime catalogue.
5. Deprecate the older catalogue entry only after affected applications have a migration path.
