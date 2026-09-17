INSERT OR IGNORE INTO Permissions(code, description)
VALUES ('inventory.view','View batch-level live stock and movement history');

INSERT OR IGNORE INTO RolePermissions(role_id, permission_id)
SELECT r.id, p.id
FROM Roles r
JOIN Permissions p ON p.code='inventory.view'
WHERE r.code IN ('pharmacist','manager','admin');

CREATE INDEX IF NOT EXISTS idx_batches_inventory_monitor
ON ProductBatches(expiry_date, quantity_on_hand, product_id);

