import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname,"../../..");
function pngSize(file:string) {
  const data=fs.readFileSync(file);
  expect([...data.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  return [data.readUInt32BE(16),data.readUInt32BE(20)];
}
describe("Tripwire icon exports",()=>{
  it.each([16,32,48,128])("exports a genuine %ipx extension icon",size=>{
    expect(pngSize(path.join(root,`apps/extension/public/icons/icon-${size}.png`))).toEqual([size,size]);
  });
  it("shares the same website favicon and 32px browser icon",()=>{
    const favicon=fs.readFileSync(path.join(root,"apps/web/app/icon.png"));
    expect(favicon.equals(fs.readFileSync(path.join(root,"apps/extension/public/icons/icon-32.png")))).toBe(true);
  });
  it("exports the transparent site/popup logo at 256px",()=>{
    expect(pngSize(path.join(root,"apps/web/public/logos/tripwire.png"))).toEqual([256,256]);
  });
});
