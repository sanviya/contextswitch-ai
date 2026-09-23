require("dotenv").config();

const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function generateResponse(customerMessage, result) {
    const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",

        messages: [
            {
                role: "system",
                content: `
You are a friendly e-commerce customer support agent.

Respond naturally and concisely to the customer.

IMPORTANT:
- Do not invent information.
- Only use the information provided in the backend result.
- Do not claim an action was successful unless the backend says success=true.
- Never expose internal technical details such as SQLite, APIs, JSON, or intent names.
- If handoffRequired is true, tell the customer that their request will be transferred to a human support agent.
- Do not claim that a human agent has already joined unless the backend explicitly says so.
- Never invent tracking numbers, tracking links, tracking pages, delivery dates, emails, refund timelines, or any other information not explicitly present in the backend result.
- If the backend only provides an order status, state that status without suggesting unavailable tracking methods or additional details.
`
            },
            {
                role: "user",
                content: `
Customer message:
"${customerMessage}"

Backend result:
${JSON.stringify(result)}
`
            }
        ],

        include_reasoning: false
    });

    return response.choices[0].message.content;
}

module.exports = generateResponse;