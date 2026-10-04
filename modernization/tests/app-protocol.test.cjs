const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {ENTRY_URL,resolveAppAsset}=require('../desktop/app-protocol.cjs');

test('P064 app protocol serves only the entry and named build assets',()=>{
  const root=path.resolve(__dirname,'../dist');
  assert.equal(resolveAppAsset(ENTRY_URL,root),path.join(root,'index.html'));
  assert.equal(resolveAppAsset('techorbit://app/assets/index-abc_123.js',root),path.join(root,'assets','index-abc_123.js'));
  for(const url of [
    'file:///C:/secret', 'https://app/index.html', 'techorbit://other/index.html',
    'techorbit://app/../secret', 'techorbit://app/assets/../secret.js',
    'techorbit://app/assets/%2e%2e/secret.js', 'techorbit://app/assets/a.js?x=1',
    'techorbit://app/desktop/worker.cjs', 'techorbit://app/assets/a.exe',
  ])assert.equal(resolveAppAsset(url,root),null,url);
});
