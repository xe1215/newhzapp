// Reuse the embedded portrait from the approved reference; never extract a user's selfie.
const fs = require('node:fs');
const path = require('node:path');
const source = process.argv[2];
if (!source) throw new Error('Pass the approved reference HTML path');
const html = fs.readFileSync(source,'utf8');
const tag = html.match(/<img\b[^>]*class="fit-photo"[^>]*>/);
const data = tag && tag[0].match(/src="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/);
if (!data) throw new Error('Reference portrait JPEG not found');
const bytes = Buffer.from(data[1],'base64');
if (bytes[0]!==255 || bytes[1]!==216) throw new Error('Invalid portrait JPEG');
const target = path.resolve(__dirname,'../miniprogram/images/demo-portrait.jpg');
fs.writeFileSync(target,bytes,{flag:'wx'});
console.log(JSON.stringify({target,bytes:bytes.length}));
