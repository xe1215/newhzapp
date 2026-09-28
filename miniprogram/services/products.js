const { resolveMediaSource } = require('../utils/media');

function mapProductRecord(record) {
  const source = record || {};
  const explicitSeries = source.series || source.seriesName || source.productSeries || '';
  const image = source.productImage || source.productImageUrl || source.productImageFileId || '';
  return {
    id: source._id || source.id || '',
    brand: source.brand || '',
    name: source.productName || source.name || source.shadeName || '',
    finish: source.texture || source.finish || '',
    scene: source.scene || '日常通勤',
    series: explicitSeries || source.productName || source.name || source.shadeName || '',
    seriesExplicit: Boolean(explicitSeries),
    status: source.status,
    tags: {...(source.tags || {}), isActive: source.status === 'active'},
    image,
    productImage: image,
    shade: {
      code: source.shadeCode || '',
      name: source.shadeName || source.productName || '',
      color: source.colorHex || '#C4938A',
      full: source.shadeName || source.productName || '',
      desc: source.shadeDescription || '',
    },
    raw: source,
  };
}

function mapProductRecords(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && record.status === 'active')
    .map(mapProductRecord);
}

async function listProducts() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.database) return Promise.resolve([]);
  const products=[];
  for(let offset=0;;offset+=20){
    let query=wx.cloud.database().collection('lipsticks').where({status:'active'});
    const paginated=typeof query.skip==='function' && typeof query.limit==='function';
    if(typeof query.orderBy==='function')query=query.orderBy('_id','asc');
    if(paginated)query=query.skip(offset).limit(20);
    const result=await query.get();
    const rows=result && result.data || [];
    products.push(...mapProductRecords(rows));
    if(!paginated || rows.length<20)break;
  }
  return products;
}

function getProduct(productId) {
  if (!productId || typeof wx === 'undefined' || !wx.cloud || !wx.cloud.database) return Promise.resolve(null);
  return wx.cloud.database().collection('lipsticks').doc(productId).get()
    .then((result) => {
      const record = result && result.data;
      return record && record.status === 'active' ? mapProductRecord(record) : null;
    })
    .catch(() => null);
}

function resolveProductImage(product, resolver) {
  return resolveMediaSource(product && (product.image || product.productImage), resolver)
    .then((url) => ({ ...(product || {}), imageUrl: url || '/images/default-goods-image.png' }));
}

module.exports = { mapProductRecord, mapProductRecords, listProducts, getProduct, resolveProductImage };
