function normalizeCustomerId(identifier) {
    if (!identifier) {
        return null;
    }

    return identifier
        .replace("whatsapp:", "")
        .replace(/\s+/g, "");
}

module.exports = {
    normalizeCustomerId
};