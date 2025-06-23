require("dotenv").config();
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const client = new BedrockRuntimeClient({ region: "us-east-1" });

async function summarizeChat(chatText,prompt = "You're a helpful assistant that summarizes WhatsApp-style group chats. Generate a short, casual summary that helps someone who missed the conversation quickly catch up and rejoin. If the messages are in Hinglish, use Hinglish. Capture the vibe (funny, serious, casual) and include emojis where it fits. Don't make things up — only summarize what was actually discussed") {
  const input = {
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  };

  const command = new InvokeModelCommand(input);
  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const inputTokens = parseInt(response.$metadata?.httpHeaders?.["x-amzn-bedrock-usage-input-tokens"]) || 0;
  const outputTokens = parseInt(response.$metadata?.httpHeaders?.["x-amzn-bedrock-usage-output-tokens"]) || 0;
  const totalTokens = inputTokens + outputTokens;

  return {
    summary: responseBody.content?.[0]?.text || "",
    tokens: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
  };
}

module.exports = { summarizeChat };
