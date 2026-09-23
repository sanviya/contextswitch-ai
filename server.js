require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const generateResponse = require("./response-generator");
const {
    db,
    getConversationHistory,
    getOrder
} = require("./database/db");
const app = express();
app.use(express.static("public"));
const conversationColumns = db
    .prepare(`PRAGMA table_info(conversations)`)
    .all();
const { normalizeCustomerId } = require("./utils/helpers");
const hasChannelColumn = conversationColumns.some(
    column => column.name === "channel"
);
const processMessage = require("./services/processMessage");

if (!hasChannelColumn) {
    db.prepare(`
        ALTER TABLE conversations
        ADD COLUMN channel TEXT
    `).run();
}
const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (
        order_id,
        status,
        payment,
        amount
    )
    VALUES (?, ?, ?, ?)
`);

insertOrder.run("4821", "cancelled", "successful", 2450);
insertOrder.run("5912", "shipped", "successful", 1299);
insertOrder.run("7345", "delivered", "successful", 899);
insertOrder.run("8563", "cancelled", "successful", 1799);
insertOrder.run("9632", "pending", "successful", 1599);


app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
    res.send("ContextSwitch backend is running!");
});
app.post("/twilio-test", (req, res) => {
    const message = req.body.Body;
    const from = req.body.From;

    console.log("Twilio message:", message);
    console.log("Customer:", from);

    res.json({
        conversationId: from,
        message: message
    });
});
function escapeXml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
app.post("/twilio", async (req, res) => {
    const conversationId = normalizeCustomerId(req.body.From);
    const message = req.body.Body;

    console.log("WhatsApp message:", message);
    console.log("Conversation:", conversationId);

    try {
        const result = await processMessage(
            conversationId,
            message,
            "whatsapp"
        );

        const twiml = `
<Response>
    <Message>${escapeXml(result.reply)}</Message>
</Response>
        `;

        res.type("text/xml");
        res.send(twiml);

    } catch (error) {
        console.log("Twilio processing error:", error.message);

        res.status(500).type("text/xml").send(`
<Response>
    <Message>Sorry, something went wrong. Please try again.</Message>
</Response>
        `);
    }
});
app.post("/voice", (req, res) => {
    const twiml = `
<Response>
    <Gather
        input="speech"
        action="https://scant-cloning-crept.ngrok-free.dev/voice-process"
        method="POST"
        speechTimeout="auto"
    >
        <Say>Hello! You have reached ContextSwitch. How can I help you today?</Say>
    </Gather>
</Response>
    `;

    res.type("text/xml");
    res.send(twiml);
});
app.post("/voice-process", async (req, res) => {
    const speech = req.body.SpeechResult;
    const conversationId = normalizeCustomerId(req.body.From);

    console.log("Caller said:", speech);
    console.log("Conversation:", conversationId);

    try {
        const result = await processMessage(
    conversationId,
    speech,
    "voice"
);

        const twiml = `
<Response>
    <Gather
        input="speech"
        action="https://scant-cloning-crept.ngrok-free.dev/voice-process"
        method="POST"
        speechTimeout="auto"
    >
        <Say>${escapeXml(result.reply)}</Say>
    </Gather>
</Response>
        `;

        res.type("text/xml");
        res.send(twiml);

    } catch (error) {
        console.log("Voice processing error:", error.message);

        res.type("text/xml");
        res.send(`
<Response>
    <Say>Sorry, I could not process your request.</Say>
</Response>
        `);
    }
});
app.get("/test-customer-id", (req, res) => {
    res.json({
        whatsapp: normalizeCustomerId("whatsapp:+918848279349"),
        voice: normalizeCustomerId("+918848279349")
    });
});
app.post("/process-test", async (req, res) => {
    const { conversationId, message } = req.body;

    try {
        const result = await processMessage(
            conversationId,
            message,
            "whatsapp"
        );

        res.json(result);
    } catch (error) {
        console.log("Process test error:", error.message);

        res.status(500).json({
            error: error.message
        });
    }
});
app.post("/messages", async (req, res) => {
    const { conversationId, message } = req.body;

    const id = conversationId || crypto.randomUUID();

    try {
        const result = await processMessage(id, message);

        res.json({
            received: true,
            ...result
        });

    } catch (error) {
        console.log("Message processing error:", error.message);

        res.status(500).json({
            error: "Failed to process message"
        });
    }
});

app.get("/messages", (req, res) => {
    const messages = db.prepare(`
        SELECT *
        FROM conversations
        ORDER BY id ASC
    `).all();

    res.json(messages);
});
app.get("/handoffs", (req, res) => {
    const handoffs = db.prepare(`
        SELECT *
        FROM handoffs
        WHERE status = 'pending'
        ORDER BY id DESC
    `).all();

    res.json(handoffs);
});
app.get("/handoffs/active", (req, res) => {
    const handoffs = db.prepare(`
        SELECT *
        FROM handoffs
        WHERE status = 'active'
        ORDER BY id DESC
    `).all();

    res.json(handoffs);
});
app.post("/handoffs/:id/resolve", (req, res) => {
    const handoffId = req.params.id;

    const result = db.prepare(`
        UPDATE handoffs
        SET status = 'resolved'
        WHERE id = ? AND status = 'active'
    `).run(handoffId);

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            error: "Active handoff not found"
        });
    }

    res.json({
        success: true,
        status: "resolved"
    });
});
app.post("/handoffs/:id/takeover", (req, res) => {
    const handoffId = req.params.id;

    const result = db.prepare(`
        UPDATE handoffs
        SET status = 'active'
        WHERE id = ? AND status = 'pending'
    `).run(handoffId);

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            error: "Handoff not found or already taken over"
        });
    }

    res.json({
        success: true,
        status: "active"
    });
});
app.get("/orders/:orderId", (req, res) => {
    const orderId = req.params.orderId;

    const order = getOrder(orderId);

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    res.json({
        orderId: orderId,
        status: order.status,
        payment: order.payment,
        amount: order.amount
    });
});

app.post("/orders/:orderId/cancel", (req, res) => {
    const orderId = req.params.orderId;

    const order = getOrder(orderId);

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    if (order.status !== "pending") {
        return res.status(400).json({
            error: "Order cannot be cancelled",
            currentStatus: order.status
        });
    }

    db.prepare(`
    UPDATE orders
    SET status = ?
    WHERE order_id = ?
`).run("cancelled", orderId);

    res.json({
        success: true,
        orderId: orderId,
        status: "cancelled"
    });
});

app.get("/conversations/:conversationId/context", (req, res) => {
    const conversationId = req.params.conversationId;

    const history = getConversationHistory(conversationId);

    if (history.length === 0) {
        return res.status(404).json({
            error: "Conversation not found"
        });
    }

    const latestMessage = history[history.length - 1];

    const messages = db.prepare(`
    SELECT
        message,
        intent,
        order_id,
        timestamp,
        channel
    FROM conversations
    WHERE conversation_id = ?
    ORDER BY id ASC
`).all(conversationId);

res.json({
    conversationId,
    context: JSON.parse(
    db.prepare(`
        SELECT context
        FROM conversations
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(conversationId).context
),
    messages
});
});
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});