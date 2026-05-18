#!/usr/bin/env bash
MODELS=(
  "@hf/nousresearch/hermes-2-pro-mistral-7b"
  "@cf/google/gemma-4-26b-a4b-it"
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
)

URL="https://tux-robot-dev.codebam.workers.dev/"
PROMPT="What is the weather in San Francisco? Use the fetch tool."

for MODEL in "${MODELS[@]}"; do
  echo "Testing model (STREAMING): $MODEL"
  curl -i -s -X POST "$URL" \
    -H "x-source: webapp" \
    -H "x-password: 207418572:AAHyA0wx27_AsYXsplB7JvKhQ7AQZB0WOsg" \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"tool_call\",
      \"prompt\": \"$PROMPT\",
      \"modelId\": \"$MODEL\",
      \"stream\": true
    }" | head -n 20
  echo -e "\n----------------------------------------"
done
