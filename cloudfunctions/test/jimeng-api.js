// Adapted from the original Jimeng helper's signing and response handling.
const crypto = require('crypto');
function providerError(code) { return Object.assign(new Error(code), {code}); }
function parse(value) {
  if (typeof value !== 'string') return value;
  // Only decode nested JSON containers. Task IDs are opaque strings, often
  // larger than Number.MAX_SAFE_INTEGER; parsing them as numbers corrupts them.
  if (!/^[\s]*[\[{]/.test(value)) return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}
function findValue(source, keys) {
  const queue = [source], seen = new Set();
  while (queue.length) {
    const node = parse(queue.shift());
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const key of keys) if (node[key] !== undefined && node[key] !== null) return parse(node[key]);
    for (const value of Object.values(node)) if (typeof value === 'object' || typeof value === 'string') queue.push(value);
  }
  return '';
}
function imageUrl(response) {
  const value = findValue(response, ['image_urls','imageUrls','image_url','imageUrl','images','url']);
  const first = Array.isArray(value) ? value[0] : value;
  const url = typeof first === 'object' && first ? first.url || first.image_url || first.imageUrl : first;
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : '';
}
async function callJimengApi(runtime, action, payload) {
  const env = runtime.env || {};
  const access = env.JIMENG_ACCESS_KEY_ID || env.VOLC_ACCESS_KEY_ID;
  const secret = env.JIMENG_SECRET_ACCESS_KEY || env.VOLC_SECRET_ACCESS_KEY;
  if (!access || !secret) throw providerError('JIMENG_CREDENTIALS_MISSING');
  const host = env.JIMENG_API_HOST || 'visual.volcengineapi.com';
  const region = env.JIMENG_REGION || 'cn-north-1', service = env.JIMENG_SERVICE || 'cv';
  const version = env.JIMENG_VERSION || '2022-08-31';
  const body = JSON.stringify(payload);
  const date = runtime.now().toISOString().replace(/[:-]|\.\d{3}/g, ''), short = date.slice(0,8);
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  const hmac = (key,value) => crypto.createHmac('sha256',key).update(value).digest();
  const headers = {'content-type':'application/json',host,'x-content-sha256':sha(body),'x-date':date};
  if (env.JIMENG_SESSION_TOKEN) headers['x-security-token'] = env.JIMENG_SESSION_TOKEN;
  const names = Object.keys(headers).sort(), signed = names.join(';');
  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(version)}`;
  const canonical = ['POST','/',query,names.map(key=>`${key}:${headers[key]}\n`).join(''),signed,sha(body)].join('\n');
  const scope = `${short}/${region}/${service}/request`;
  const key = hmac(hmac(hmac(hmac(Buffer.from(secret),short),region),service),'request');
  const signature = hmac(key,['HMAC-SHA256',date,scope,sha(canonical)].join('\n')).toString('hex');
  headers.Authorization = `HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  headers['content-length'] = Buffer.byteLength(body);
  const response = await runtime.httpRequest({method:'POST',hostname:host,path:`/?${query}`,headers,timeout:12000}, body);
  if (!response) throw providerError('JIMENG_INVALID_RESPONSE');
  const root = response.json || parse(response.body);
  if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) throw Object.assign(providerError('JIMENG_HTTP_ERROR'),{httpStatus:response.statusCode,providerCode:root && (root.code || root.ResponseMetadata && root.ResponseMetadata.Error && root.ResponseMetadata.Error.Code),providerMessage:String(root && root.message || '').replace(/https?:\/\/\S+/g,'[url]').slice(0,160)});
  if (!root || typeof root !== 'object') throw providerError('JIMENG_INVALID_RESPONSE');
  if (root.ResponseMetadata && root.ResponseMetadata.Error) throw Object.assign(providerError('JIMENG_API_ERROR'),{providerCode:root.ResponseMetadata.Error.Code});
  if (root.code !== undefined && ![0,10000].includes(Number(root.code))) throw Object.assign(providerError('JIMENG_API_ERROR'),{providerCode:root.code});
  return root;
}
module.exports = {callJimengApi, findValue, imageUrl, providerError};
