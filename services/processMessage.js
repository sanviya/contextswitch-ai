const {
    db,
    getConversationHistory,
    getOrder
} = require("../database/db");
const { analyzeMessage } = require("./ai");
const generateResponse = require("../response-generator");
    async function processMessage(conversationId, message, channel)  {
    console.log("Processing customer:", conversationId);
    const history = getConversationHistory(conversationId);

    const analysis = await analyzeMessage(message, history);

    let orderId = analysis.orderId;
    let intent = analysis.intent;

    if (!orderId && history.length > 0) {
        const previousMessage = [...history]
            .reverse()
            .find(msg => msg.orderId);

        if (previousMessage) {
            orderId = previousMessage.orderId;
        }
    }

    if (intent === "unknown" && history.length > 0) {
        const previousMessage = [...history]
            .reverse()
            .find(msg => msg.intent !== "unknown");

        if (previousMessage) {
            intent = previousMessage.intent;
        }
    }

    let orderDetails = null;
    let actionResult = null;
    let handoffRequired = false;

    if (orderId && intent === "order_status") {
    const order = getOrder(orderId);

    if (order) {
        orderDetails = order;
    } else {
        actionResult = {
            success: false,
            error: "Order not found"
        };
    }
}

    if (orderId && intent === "cancel_order") {
        const order = getOrder(orderId);

        if (!order) {
            actionResult = {
                success: false,
                error: "Order not found"
            };
        } else if (order.status !== "pending") {
    orderDetails = order;

    actionResult = {
        success: false,
        error: "Order cannot be cancelled",
        currentStatus: order.status
    };
} else {
            db.prepare(`
                UPDATE orders
                SET status = ?
                WHERE order_id = ?
            `).run("cancelled", orderId);

            actionResult = {
                success: true,
                orderId: orderId,
                status: "cancelled"
            };

            orderDetails = getOrder(orderId);
        }
    }
    if (orderId && intent === "refund") {
    const order = getOrder(orderId);

    if (!order) {
        actionResult = {
            success: false,
            error: "Order not found"
        };
    } else {
        orderDetails = order;

        if (order.payment !== "successful") {
            actionResult = {
                success: false,
                error: "Refund is not applicable because the payment was not successful."
            };
        } else if (order.status !== "delivered") {
            actionResult = {
                success: false,
                error: "This order is not currently eligible for a refund."
            };
        } else {
            actionResult = {
                success: true,
                orderId: orderId,
                status: "refund_requested",
                amount: order.amount
            };
        }
    }
}
if (intent === "human_handoff") {
    handoffRequired = true;

    db.prepare(`
        INSERT INTO handoffs (
            conversation_id,
            customer_id,
            reason,
            status,
            channel,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        conversationId,
        conversationId,
        "customer_requested_human",
        "pending",
        channel,
        new Date().toISOString()
    );

    actionResult = {
        success: true,
        status: "handoff_requested"
    };
}
    if (orderId && !orderDetails) {
    orderDetails = getOrder(orderId);
}

const context = {
    intent: intent,
    orderId: orderId,
    orderStatus: orderDetails ? orderDetails.status : null,
    paymentStatus: orderDetails ? orderDetails.payment : null,
    handoffRequired: handoffRequired
};

    const backendResult = {
        orderDetails,
        actionResult,
        context
    };

    let reply;

    try {
        reply = await generateResponse(message, backendResult);
    } catch (error) {
        console.log("AI response generation failed:", error.message);
        if (handoffRequired) {
    reply = "I'll connect you with a human support agent.";
} else if (actionResult?.success) {
    reply = `Your order #${orderId} has been ${actionResult.status}.`;
} else if (actionResult?.error) {
    reply = actionResult.error;
} else if (orderDetails) {
    reply = `Your order #${orderId} is currently ${orderDetails.status}.`;
} else {
    reply = "Sorry, I couldn't process your request right now. Please try again.";
}
    }

    const insertConversation = db.prepare(`
    INSERT INTO conversations (
        conversation_id,
        message,
        intent,
        order_id,
        context,
        timestamp,
        channel
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insertConversation.run(
    conversationId,
    message,
    intent,
    orderId,
    JSON.stringify(context),
    new Date().toISOString(),
    channel
);
    return {
        conversationId,
        intent,
        orderId,
        orderDetails,
        actionResult,
        context,
        reply
    };
}
module.exports = processMessage;