// Full-figure gap overlay: gray = silhouette, red = muscle regions, MAGENTA = silhouette pixels
// no region covers, CYAN = region painted outside the silhouette.
import { chromium } from "playwright-core";
import { writeFileSync } from "fs";
const OUT = process.argv[2];
const data = await import("../src/bodyMapData.js");
const COMBOS = [["BODYMAP_MALE","front"],["BODYMAP_MALE","back"],["BODYMAP_FEMALE","front"],["BODYMAP_FEMALE","back"]];
const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport:{width:1400,height:900} });
await page.setContent("<body style='margin:0'></body>");
for (const [m,v] of COMBOS) {
  const f = data[m][v];
  const regions = Object.fromEntries(Object.entries(f).filter(([k])=>k!=="_body"));
  const url = await page.evaluate(({body,regions,label})=>{
    const S=3, X0=20, Y0=0, W=215, H=420;
    const paint=(c,d,fill,lw,st)=>{const p=new Path2D(d);c.fillStyle=fill;c.fill(p);if(lw){c.strokeStyle=st;c.lineWidth=lw;c.lineJoin="round";c.stroke(p);}};
    const mk=()=>{const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const x=c.getContext("2d",{willReadFrequently:true});x.setTransform(S,0,0,S,-X0*S,-Y0*S);return[c,x];};
    const [,sx]=mk(); paint(sx,body,"#fff",3,"#fff");
    const [,rx]=mk(); for(const d of Object.values(regions)) paint(rx,d,"#fff",0.5,"#fff");
    const [vis,v]=mk();
    v.fillStyle="#1c1c22"; v.fillRect(X0,Y0,W,H);
    v.globalAlpha=0.55; paint(v,body,"#3f4049",19,"#3f4049");
    v.globalAlpha=1;    paint(v,body,"#3f4049",3,"#3f4049");
    for(const d of Object.values(regions)) paint(v,d,"#ff3b30",0.5,"#2a2a30");
    const sd=sx.getImageData(0,0,W*S,H*S).data, rd=rx.getImageData(0,0,W*S,H*S).data;
    const img=v.getImageData(0,0,W*S,H*S);
    for(let i=0;i<W*S*H*S;i++){const s=sd[i*4+3]>40,g=rd[i*4+3]>40;
      if(s&&!g){img.data[i*4]=255;img.data[i*4+1]=0;img.data[i*4+2]=255;img.data[i*4+3]=255;}
      else if(g&&!s){img.data[i*4]=0;img.data[i*4+1]=255;img.data[i*4+2]=255;img.data[i*4+3]=255;}}
    v.setTransform(1,0,0,1,0,0); v.putImageData(img,0,0);
    v.fillStyle="#fff"; v.font="bold 22px system-ui"; v.fillText(label,10,26);
    return vis.toDataURL("image/png");
  },{body:f._body,regions,label:`${m.replace("BODYMAP_","")} ${v}`});
  const file=`${OUT}/full-${m.replace("BODYMAP_","").toLowerCase()}-${v}.png`;
  writeFileSync(file, Buffer.from(url.split(",")[1],"base64"));
  console.log(file);
}
await browser.close();
