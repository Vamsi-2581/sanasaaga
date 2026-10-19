#!/usr/bin/env bash
set -e

PORT="${PORT:-8000}"
IMAGE_NAME="sanadruidi:latest"
CONTAINER_NAME="sanadruidi"

echo "🌿 Sanadruidi - Suomenkielinen Wordle"
echo "======================================"

# Check if image exists, build if not
if ! podman image exists "${IMAGE_NAME}"; then
  echo "Rakennetaan Podman-kontti (${IMAGE_NAME})..."
  podman build -t "${IMAGE_NAME}" .
fi

# Stop existing container if running
if podman container exists "${CONTAINER_NAME}"; then
  echo "Pysäytetään aiempi kontti..."
  podman stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  podman rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

echo "Käynnistetään Sanadruidi porttiin ${PORT}..."
podman run -d \
  --name "${CONTAINER_NAME}" \
  -p "${PORT}:8000" \
  "${IMAGE_NAME}"

echo ""
echo "✅ Sanadruidi on käynnissä!"
echo "👉 Avaa selaimessa: http://localhost:${PORT} tai http://127.0.0.1:${PORT}"
echo ""
echo "Hyödyllisiä komentoja:"
echo "  Lokit:      podman logs -f ${CONTAINER_NAME}"
echo "  Pysäytys:   podman stop ${CONTAINER_NAME}"
