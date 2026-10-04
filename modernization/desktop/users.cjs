const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { ROLE_CODES, hasPermission } = require('../../infrastructure/sqlite/services/auth-bootstrap');

class UsersAdmin {
  constructor(db) { this.db = db; }
  catalog() {
    const roles = this.db.prepare('SELECT id,code,name FROM Roles ORDER BY id').all();
    const permissions = this.db.prepare('SELECT code,description FROM Permissions ORDER BY code').all();
    const rolePermissions = this.db.prepare('SELECT r.code roleCode,p.code permissionCode FROM RolePermissions rp JOIN Roles r ON r.id=rp.role_id JOIN Permissions p ON p.id=rp.permission_id').all();
    return { roles, permissions, rolePermissions };
  }
  list() {
    return this.db.prepare(`SELECT u.id,u.username,u.display_name displayName,r.code roleCode,u.active,u.must_change_password mustChangePassword,u.created_at createdAt,u.updated_at updatedAt
      FROM Users u JOIN Roles r ON r.id=u.role_id ORDER BY u.active DESC,u.username`).all()
      .map(row => ({...row,active:Boolean(row.active),mustChangePassword:Boolean(row.mustChangePassword)}));
  }
  detail(id) {
    const user = this.list().find(row => row.id === Number(id));
    if (!user) throw Error('User was not found');
    const overrides = this.db.prepare('SELECT p.code,up.allowed FROM UserPermissions up JOIN Permissions p ON p.id=up.permission_id WHERE up.user_id=? ORDER BY p.code').all(user.id);
    return {...user,overrides:Object.fromEntries(overrides.map(row => [row.code,Boolean(row.allowed)]))};
  }
  audit(actor,action,id,before,after) {
    this.db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,previous_json,new_json,device_id)
      VALUES(?,?,?,?,'user',?,?,?,'modern-desktop')`).run(new Date().toISOString(),actor.id,actor.roleCode,action,String(id),before?JSON.stringify(before):null,after?JSON.stringify(after):null);
  }
  temporaryPassword() {
    return `${crypto.randomBytes(18).toString('base64url')}aA1!`;
  }
  create(input,actor) {
    const username = String(input?.username||'').trim().toLowerCase();
    const displayName = String(input?.displayName||'').trim();
    const roleCode = String(input?.roleCode||'');
    if (!/^[a-z][a-z0-9._-]{2,39}$/.test(username)) throw Error('Username must be 3–40 lowercase letters, numbers, dots, underscores or hyphens');
    if (displayName.length < 2 || displayName.length > 100) throw Error('Display name must be 2–100 characters');
    if (!ROLE_CODES.includes(roleCode)) throw Error('Choose one of the four roles');
    const password = this.temporaryPassword();
    const now = new Date().toISOString();
    let id;
    try {
      id = this.db.transaction(() => {
        const result = this.db.prepare(`INSERT INTO Users(username,password_hash,display_name,role_id,active,must_change_password,created_at,updated_at)
          SELECT ?,?,?,id,1,1,?,? FROM Roles WHERE code=?`).run(username,bcrypt.hashSync(password,12),displayName,now,now,roleCode);
        const newId = Number(result.lastInsertRowid);
        this.audit(actor,'user.create',newId,null,{username,displayName,roleCode,active:true,mustChangePassword:true});
        return newId;
      })();
    } catch (error) {
      if (error.code?.startsWith('SQLITE_CONSTRAINT')) throw Error('Username is already in use');
      throw error;
    }
    return {user:this.detail(id),temporaryPassword:password};
  }
  update(input,actor) {
    const id = Number(input?.id);
    if (!Number.isSafeInteger(id) || id < 1) throw Error('Choose a valid user');
    const before = this.detail(id);
    const displayName = String(input?.displayName||'').trim();
    const roleCode = String(input?.roleCode||'');
    if (displayName.length < 2 || displayName.length > 100) throw Error('Display name must be 2–100 characters');
    if (!ROLE_CODES.includes(roleCode) || typeof input.active !== 'boolean') throw Error('Choose a valid role and active status');
    if (id === actor.id && (!input.active || roleCode !== 'admin')) throw Error('You cannot remove your own admin access');
    if (before.roleCode === 'admin' && before.active && (!input.active || roleCode !== 'admin')) {
      const admins = this.db.prepare("SELECT COUNT(*) count FROM Users u JOIN Roles r ON r.id=u.role_id WHERE r.code='admin' AND u.active=1").get().count;
      if (admins <= 1) throw Error('At least one active admin is required');
    }
    return this.db.transaction(() => {
      this.db.prepare('UPDATE Users SET display_name=?,role_id=(SELECT id FROM Roles WHERE code=?),active=?,updated_at=? WHERE id=?')
        .run(displayName,roleCode,input.active?1:0,new Date().toISOString(),id);
      const after = this.detail(id);
      this.audit(actor,'user.update',id,{displayName:before.displayName,roleCode:before.roleCode,active:before.active},{displayName:after.displayName,roleCode:after.roleCode,active:after.active});
      return after;
    })();
  }
  resetPassword(input,actor) {
    const id = Number(input?.id);
    const user = this.detail(id);
    if (!user.active) throw Error('Activate the account before resetting its password');
    const password = this.temporaryPassword();
    this.db.transaction(() => {
      this.db.prepare('UPDATE Users SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?')
        .run(bcrypt.hashSync(password,12),new Date().toISOString(),id);
      this.audit(actor,'user.password_reset',id,null,{mustChangePassword:true});
    })();
    return {user:this.detail(id),temporaryPassword:password};
  }
  setPermission(input,actor) {
    const id = Number(input?.id);
    const user = this.detail(id);
    const permissionCode = String(input?.permissionCode||'');
    const mode = input?.mode;
    if (!['allow','deny','inherit'].includes(mode)) throw Error('Choose allow, deny or inherit');
    const permission = this.db.prepare('SELECT id FROM Permissions WHERE code=?').get(permissionCode);
    if (!permission) throw Error('Permission was not found');
    if (id === actor.id && permissionCode === 'user.manage' && mode === 'deny') throw Error('You cannot remove your own user administration access');
    // A non-admin may never receive the ability to administer accounts, even by override.
    if (permissionCode === 'user.manage' && user.roleCode !== 'admin' && mode === 'allow') throw Error('User administration is reserved for admins');
    const before = Object.hasOwn(user.overrides,permissionCode) ? user.overrides[permissionCode] : null;
    this.db.transaction(() => {
      if (mode === 'inherit') this.db.prepare('DELETE FROM UserPermissions WHERE user_id=? AND permission_id=?').run(id,permission.id);
      else this.db.prepare(`INSERT INTO UserPermissions(user_id,permission_id,allowed) VALUES(?,?,?)
        ON CONFLICT(user_id,permission_id) DO UPDATE SET allowed=excluded.allowed`).run(id,permission.id,mode==='allow'?1:0);
      this.audit(actor,'user.permission',id,{permissionCode,override:before},{permissionCode,override:mode==='inherit'?null:mode==='allow'});
    })();
    return {user:this.detail(id),effective:hasPermission(this.db,id,permissionCode)};
  }
}
module.exports = { UsersAdmin };
