INSERT OR IGNORE INTO Permissions(code, description)
VALUES ('medicine.alternatives','View and explicitly select medicine alternatives');

INSERT OR IGNORE INTO RolePermissions(role_id, permission_id)
SELECT r.id, p.id
FROM Roles r
JOIN Permissions p ON p.code='medicine.alternatives'
WHERE r.code IN ('pharmacist','admin');

CREATE INDEX IF NOT EXISTS idx_products_alternative_match
ON Products(generic_name COLLATE NOCASE, strength COLLATE NOCASE, dosage_form COLLATE NOCASE)
WHERE active=1;
