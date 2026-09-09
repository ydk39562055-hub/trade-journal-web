import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const window={};vm.runInNewContext(await readFile(new URL('../app/broker-attachments.js',import.meta.url),'utf8'),{window,URL});
test('snapshot links cannot execute scripts or redirect to lookalike sites',()=>{
  assert.equal(window.TJAttachments.link('https://www.tradingview.com/x/Test123/?x=1'),'https://www.tradingview.com/x/Test123/');
  for(const link of ['javascript:alert(1)','https://tradingview.com.evil.test/x/Test/','http://www.tradingview.com/x/Test/','https://user:pw@www.tradingview.com/x/Test/','https://www.tradingview.com/redirect'])assert.throws(()=>window.TJAttachments.link(link));
});
test('attachments render only bounded raster data; remote and SVG images are rejected',()=>{
  assert.equal(window.TJAttachments.safeImage('data:image/jpeg;base64,YQ=='),true);
  for(const value of ['https://example.com/a.jpg','data:image/svg+xml;base64,YQ==',null,'data:image/jpeg;base64,'+'A'.repeat(450000)])assert.equal(window.TJAttachments.safeImage(value),false);
});
