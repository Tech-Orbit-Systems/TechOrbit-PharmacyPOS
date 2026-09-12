const http = require("http");
const path = require("path");
const express = require("express")();
const server = http.createServer(express);
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const pkg = require("./package.json");
const {app} = require('electron');
const { getDatabase, getSqliteFilename } = require("./infrastructure/sqlite/runtime");
const { createSqliteSalesRouter } = require("./api/v2/sqlite-sales");
const { createSqliteProductsRouter } = require("./api/v2/sqlite-products");
const { createProductImportRouter } = require("./api/v2/sqlite-product-import");
const { createOpeningStockImportRouter } = require("./api/v2/sqlite-opening-stock-import");
const { createPurchasePaymentsRouter } = require("./api/v2/sqlite-purchase-payments");
const { createPurchaseReturnsRouter } = require("./api/v2/sqlite-purchase-returns");
const { createExpensesRouter } = require("./api/v2/sqlite-expenses");
const { createCashClosingRouter } = require("./api/v2/sqlite-cash-closing");
const { createCustomerAccountsRouter } = require("./api/v2/sqlite-customer-accounts");
const { createStockAdjustmentsRouter } = require("./api/v2/sqlite-stock-adjustments");
const { createBackupsRouter } = require("./api/v2/sqlite-backups");
const { createAuthRouter } = require("./api/v2/sqlite-auth");
const { loadOrCreateSecret, createAuthMiddleware, requirePermission } = require("./infrastructure/security/session-auth");
process.env.APPDATA = app.getPath('appData');
process.env.APPNAME = pkg.name;
const authSecret = loadOrCreateSecret(path.join(process.env.APPDATA, process.env.APPNAME, "server", "session.secret"));
const authRequired = process.env.TECHORBIT_V2_AUTH_REQUIRED === "1";
const authenticateV2 = createAuthMiddleware({ db: getDatabase, secret: authSecret, required: authRequired });
const secure = permission => authRequired ? [authenticateV2, requirePermission(getDatabase, permission)] : [];
const PORT = Number(process.env.PORT || 3210);
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
});

console.log("Server started");

express.use(bodyParser.json());
express.use(bodyParser.urlencoded({ extended: false }));
express.use(limiter);

express.all("/{*path}", function (req, res, next) {
    const origin = req.get("origin");
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        if (origin) res.header("Access-Control-Allow-Origin", origin);
    } else return res.status(403).json({ error: "ORIGIN_NOT_ALLOWED" });
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-type,Accept,Authorization,X-Access-Token,X-Key",
    );
    if (req.method == "OPTIONS") {
        res.status(200).end();
    } else {
        next();
    }
});

express.get("/", function (req, res) {
    res.send("POS Server Online.");
});

express.use("/api/inventory", require("./api/inventory"));
express.use("/api/customers", require("./api/customers"));
express.use("/api/categories", require("./api/categories"));
express.use("/api/settings", require("./api/settings"));
express.use("/api/users", require("./api/users"));
express.use("/api/v2/auth", createAuthRouter({ getDatabase, secret: authSecret, authMiddleware: createAuthMiddleware({ db: getDatabase, secret: authSecret, required: true }) }));
express.use("/api/v2/sales", ...secure("sale.create"), createSqliteSalesRouter({ getDatabase }));
express.use("/api/v2/products", createSqliteProductsRouter({ getDatabase }));
express.use("/api/v2/imports/products", ...secure("stock.adjust"), createProductImportRouter({ getDatabase }));
express.use("/api/v2/imports/opening-stock", ...secure("stock.adjust"), createOpeningStockImportRouter({ getDatabase }));
express.use("/api/v2/purchase-payments", ...secure("dues.manage"), createPurchasePaymentsRouter({ getDatabase }));
express.use("/api/v2/purchase-returns", ...secure("return.supplier"), createPurchaseReturnsRouter({ getDatabase }));
express.use("/api/v2/expenses", ...secure("expense.manage"), createExpensesRouter({ getDatabase }));
express.use("/api/v2/closing", ...secure("closing.create"), createCashClosingRouter({ getDatabase }));
express.use("/api/v2/customer-accounts", ...secure("dues.manage"), createCustomerAccountsRouter({ getDatabase }));
express.use("/api/v2/stock-adjustments", ...secure("stock.adjust"), createStockAdjustmentsRouter({ getDatabase }));
express.use("/api/v2/backups", ...secure("backup.manage"), createBackupsRouter({ getDatabase, getDatabaseFile: getSqliteFilename, getBackupDir: () => path.join(process.env.APPDATA, process.env.APPNAME, "backups") }));
express.use("/api", require("./api/transactions"));

server.listen(PORT, () => {
    process.env.PORT = server.address().port;
    console.log("Listening on PORT", process.env.PORT);
});

/**
 * Restarts the server process.
 */
function restartServer() {
    server.close(() => {
        // Remove cached modules so require() reloads them
        Object.keys(require.cache).forEach(key => {
            if (key.includes('api') || key.endsWith('server.js')) {
                delete require.cache[key];
            }
        });
        // Re-require server.js to restart everything
        require('./server');
    });
}

module.exports = { restartServer };
