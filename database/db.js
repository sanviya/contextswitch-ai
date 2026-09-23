const Database = require("better-sqlite3");

const db = new Database("contextswitch.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        message TEXT NOT NULL,
        intent TEXT,
        order_id TEXT,
        context TEXT,
        timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        payment TEXT NOT NULL,
        amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handoffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        channel TEXT,
        created_at TEXT NOT NULL
    );
`);

const conversationColumns = db
    .prepare(`PRAGMA table_info(conversations)`)
    .all();

const hasChannelColumn = conversationColumns.some(
    column => column.name === "channel"
);

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
function getConversationHistory(conversationId) {
    const rows = db.prepare(`
        SELECT *
        FROM conversations
        WHERE conversation_id = ?
        ORDER BY id ASC
    `).all(conversationId);

    return rows.map(row => ({
        conversationId: row.conversation_id,
        message: row.message,
        intent: row.intent,
        orderId: row.order_id,
        context: JSON.parse(row.context),
        timestamp: row.timestamp,
        channel: row.channel
    }));
}

function getOrder(orderId) {
    return db.prepare(`
        SELECT *
        FROM orders
        WHERE order_id = ?
    `).get(orderId);
}
module.exports = {
    db,
    getConversationHistory,
    getOrder
};