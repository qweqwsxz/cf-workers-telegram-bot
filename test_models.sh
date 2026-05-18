#!/usr/bin/env bash
MODELS=(
  "@hf/nousresearch/hermes-2-pro-mistral-7b"
  "@cf/google/gemma-4-26b-a4b-it"
  "google/gemini-3-flash"
  "google/gemini-3.1-flash-lite"
  "google/gemini-3.1-pro"
  "@cf/moonshotai/kimi-k2.6"
  "@cf/zai-org/glm-4.7-flash"
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
  "@cf/nvidia/nemotron-3-120b-a12b"
)

URL="https://tux-robot-dev.codebam.workers.dev/"
PROMPT="What is the weather in San Francisco? Use the fetch tool."

for MODEL in "${MODELS[@]}"; do
  echo "Testing model: $MODEL"
  curl -s -X POST "$URL" \
    -H "x-source: webapp" \
    -H "x-password: 207418572:AAHyA0wx27_AsYXsplB7JvKhQ7AQZB0WOsg" \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"tool_call\",
      \"prompt\": \"$PROMPT\",
      \"modelId\": \"$MODEL\",
      \"stream\": false
    }" | jq .
  echo "----------------------------------------"
done
