require("dotenv").config();

const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function analyzeMessage(message, history) {
    const conversationContext = history
        .map(msg => `Customer: ${msg.message}`)
        .join("\n");

    const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",

        messages: [
            {
                role: "system",
                content: `
You are an intent classifier for an e-commerce customer support system.

Your job is to identify what the customer wants.

Possible intents:
- order_status
- cancel_order
- refund
- human_handoff
- unknown

Use the previous conversation to understand references such as:
- "it"
- "that order"
- "the same one"
- "cancel it"
- "check again"

Extract the order number if it is directly mentioned or can be confidently identified from the conversation.

Return ONLY valid JSON in exactly this format:

{
  "intent": "order_status",
  "orderId": "5912"
}

Rules:
- intent must be one of: order_status, cancel_order, refund, human_handoff, unknown
- orderId must be a string containing the order number, or null
- Do not add any other fields
`
            },
            {
                role: "user",
                content: `
Previous conversation:
${conversationContext || "No previous conversation."}

Current customer message:
"${message}"
`
            }
        ],

        response_format: {
            type: "json_schema",
            json_schema: {
                name: "intent_result",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        intent: {
                            type: "string",
                            enum: [
                                "order_status",
                                "cancel_order",
                                "refund",
                                "human_handoff",
                                "unknown"
                            ]
                        },
                        orderId: {
                            type: ["string", "null"]
                        }
                    },
                    required: ["intent", "orderId"],
                    additionalProperties: false
                }
            }
        },

        reasoning_effort: "low"
    });

    return JSON.parse(response.choices[0].message.content);
}

module.exports = {
    analyzeMessage
};