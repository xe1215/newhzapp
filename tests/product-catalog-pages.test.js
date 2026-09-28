const assert=require('node:assert/strict');
const {test}=require('node:test');
const {listProducts}=require('../miniprogram/services/products');
test('all active products including later database pages are available for selection',async()=>{
  const all=Array.from({length:43},(_,i)=>({_id:'lip-'+i,status:'active',productName:'Series',brand:'Brand'}));
  global.wx={cloud:{database:()=>({collection:()=>({where:filter=>{
    assert.deepEqual(filter,{status:'active'});
    let offset=0,limit=20;
    return {orderBy(){return this;},skip(n){offset=n;return this;},limit(n){limit=n;return this;},async get(){return {data:all.slice(offset,offset+limit)};}};
  }})})}};
  assert.equal((await listProducts()).length,43);
});
