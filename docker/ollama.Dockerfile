# Ollama image with the app's default model pre-pulled at build time, so
# scheduled CI runs don't re-download ~1.9GB from the Ollama registry on
# every run. Rebuild and push this (see
# .github/workflows/build-ollama-image.yml) whenever the model tag changes.
FROM ollama/ollama:latest

RUN (ollama serve &) && sleep 5 && ollama pull qwen2.5:3b-instruct
