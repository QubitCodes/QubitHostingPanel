# GhostDeploy Coolify helper

This image extends the exact Coolify helper release and wraps only `nixpacks plan`. When GhostDeploy supplies `GHOST_DEPLOY_AUTO_CHARSET_FIX=true`, eligible non-UTF-8 text files are normalized inside Coolify's disposable `/artifacts/<deployment>` checkout before Nixpacks inspects it. The upstream Git repository is never written to.

Build the tag matching Coolify's configured helper version:

```bash
docker build -t ghostdeploy/coolify-helper:1.0.14 infrastructure/coolify-helper
```

Set `HELPER_IMAGE=ghostdeploy/coolify-helper` in `/data/coolify/source/.env`, restart the Coolify application containers, and confirm deployment logs name `ghostdeploy/coolify-helper:1.0.14`. Rebuild the matching custom tag before every Coolify helper-version upgrade.

The original bytes are copied outside the Docker build context for the duration of the helper container. Durable recovery remains the immutable Git commit and the previous successful deployment image. Conversion markers contain paths, encodings, confidence, and checksums but never source contents.
