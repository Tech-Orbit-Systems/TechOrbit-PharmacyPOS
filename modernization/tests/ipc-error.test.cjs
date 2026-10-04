const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicError}=require('../desktop/ipc-error.cjs');

test('P064 IPC errors carry safe codes and correlation IDs without database details',()=>{
  assert.deepEqual(publicError(Error('Invalid request payload'),'IPC-4'),{code:'INVALID_REQUEST',message:'Invalid request payload',requestId:'IPC-4'});
  assert.equal(publicError(Error('Your role does not allow this action'),'IPC-5').code,'ACCESS_DENIED');
  assert.deepEqual(publicError(Error('SQLITE_CONSTRAINT: users password_hash'),'IPC-6'),{code:'INTERNAL',message:'Operation failed. Please retry or contact support.',requestId:'IPC-6'});
  assert.equal(publicError(Error('C:\\secret\\users.sqlite'),'IPC-7').message,'Operation failed. Please retry or contact support.');
});
