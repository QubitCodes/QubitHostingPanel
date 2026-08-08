# GhostDeploy Coolify helper

This image extends the exact Coolify helper release and wraps only `nixpacks plan`. When Ghost Deploy supplies the internal `NIXPACKS_GHOST_DEPLOY_AUTO_CHARSET_FIX=true` build hint, eligible non-UTF-8 text files are normalized inside Coolify's disposable `/artifacts/<deployment>` checkout before source inspection. The upstream Git repository is never written to.

Build the tag matching Coolify's configured helper version:

```bash
docker build -t ghostdeploy/coolify-helper:1.0.14 infrastructure/coolify-helper
```

Set `HELPER_IMAGE=ghostdeploy/coolify-helper` in `/data/coolify/source/.env`, restart the Coolify application containers, and confirm deployment logs name `ghostdeploy/coolify-helper:1.0.14`. Rebuild the matching custom tag before every Coolify helper-version upgrade.

The original bytes are copied outside the Docker build context for the duration of the helper container. Durable recovery remains the immutable Git commit and the previous successful deployment image. Conversion markers contain paths, encodings, confidence, and checksums but never source contents.

Compatibility diagnostics are written to stderr so the machine-readable build plan on stdout remains valid. The disposable build context also excludes repository-copied `node_modules` and `vendor` directories, preventing them from replacing dependencies installed for the Linux image; customer Git contents are unchanged.

Detected Laravel applications receive a disposable `/app/public` Nginx template only when the repository does not provide `nginx.conf` or `nginx.template.conf`. Repository-owned server configuration always takes precedence.
