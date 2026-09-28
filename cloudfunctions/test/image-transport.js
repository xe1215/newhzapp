// Transport extracted from the former Jimeng helper, with bounded I/O.
const https = require('https');

function requestBuffer(options, body, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.request({ ...options, timeout: options.timeout || 12000 }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location && !body) {
        response.resume();
        if (redirects >= 3) return reject(new Error('IMAGE_REDIRECT_LIMIT'));
        const target = new URL(response.headers.location, `https://${options.hostname}${options.path}`);
        if (target.protocol !== 'https:') return reject(new Error('IMAGE_URL_INVALID'));
        return resolve(requestBuffer({hostname:target.hostname,path:target.pathname+target.search,method:'GET'}, null, redirects + 1));
      }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 25 * 1024 * 1024) request.destroy(new Error('IMAGE_RESPONSE_TOO_LARGE'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({statusCode:response.statusCode,headers:response.headers,buffer:Buffer.concat(chunks)}));
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(Object.assign(new Error('Image request timed out'), {code:'IMAGE_REQUEST_TIMEOUT'})));
    if (body) request.write(body);
    request.end();
  });
}

async function httpRequest(options, body) {
  const response = await requestBuffer(options, body);
  const text = response.buffer.toString('utf8');
  let json;
  try { json = JSON.parse(text); } catch (_) { json = {}; }
  return {statusCode:response.statusCode,headers:response.headers,body:text,json};
}

async function downloadUrl(url) {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('IMAGE_URL_INVALID');
  const response = await requestBuffer({hostname:target.hostname,path:target.pathname+target.search,method:'GET'});
  if (response.statusCode < 200 || response.statusCode >= 300 || !response.buffer.length) throw new Error('IMAGE_DOWNLOAD_FAILED');
  return response.buffer;
}

module.exports = {httpRequest, downloadUrl};
