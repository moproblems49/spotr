// Does the Forearms region reach the FINGERTIPS? Compare the silhouette's arm extremities with the
// Forearms region's own extremities, and measure what share of the silhouette in the outermost
// 12 x-units of each arm (above the hip) the Forearms path actually paints.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage(); await page.setContent("<body></body>");
const COMBOS=[["BODYMAP_MALE","front"],["BODYMAP_MALE","back"],["BODYMAP_FEMALE","front"],["BODYMAP_FEMALE","back"]];
for (const spec of process.argv.slice(2)) {
  const [label,path]=spec.split("="); const data=await import(path);
  console.log(`\n════ ${label} ════`);
  for (const [m,v] of COMBOS) {
    const f=data[m][v]; const regions=Object.fromEntries(Object.entries(f).filter(([k])=>k!=="_body"));
    const fk=Object.keys(regions).find(k=>/forearm/i.test(k));
    const r=await page.evaluate(({body,fa})=>{
      const S=4,W=280,H=440,NW=W*S;
      const paint=(c,d,lw)=>{const p=new Path2D(d);c.fillStyle="#fff";c.fill(p);if(lw){c.strokeStyle="#fff";c.lineWidth=lw;c.lineJoin="round";c.stroke(p);}};
      const mk=()=>{const c=document.createElement("canvas");c.width=NW;c.height=H*S;const x=c.getContext("2d",{willReadFrequently:true});x.setTransform(S,0,0,S,0,0);return[c,x];};
      const [,bx]=mk(); paint(bx,body,3);
      const [,fx]=mk(); paint(fx,fa,0.5);
      const bd=bx.getImageData(0,0,NW,H*S).data, fd=fx.getImageData(0,0,NW,H*S).data;
      const at=(t,x,y)=>t[((y*NW)+x)*4+3]>40;
      const YMAX=210*S;
      let bx0=1e9,bx1=-1e9,fx0=1e9,fx1=-1e9,fy1=-1e9,by1=-1e9;
      for(let y=0;y<YMAX;y++)for(let x=0;x<NW;x++){
        if(at(bd,x,y)){if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y>by1)by1=y;}
        if(at(fd,x,y)){if(x<fx0)fx0=x;if(x>fx1)fx1=x;if(y>fy1)fy1=y;}}
      const u=n=>+(n/S).toFixed(1);
      const tip={};
      for(const side of ["left","right"]){
        const lo=side==="left"?bx0:bx1-12*S, hi=side==="left"?bx0+12*S:bx1;
        let b=0,c=0;
        for(let y=0;y<YMAX;y++)for(let x=lo;x<=hi;x++) if(at(bd,x,y)){b++; if(at(fd,x,y))c++;}
        tip[side]=b?+(100*c/b).toFixed(1):0;
      }
      return { silX:[u(bx0),u(bx1)], silBotY:u(by1), faX:[u(fx0),u(fx1)], faBotY:u(fy1), tip };
    },{body:f._body,fa:regions[fk]});
    console.log(`  ${(m.replace("BODYMAP_","")+" "+v).padEnd(14)} silhouette x ${String(r.silX[0]).padStart(5)}..${String(r.silX[1]).padStart(5)} bottom ${r.silBotY}  |  Forearms x ${String(r.faX[0]).padStart(5)}..${String(r.faX[1]).padStart(5)} bottom ${r.faBotY}  |  outer-12u silhouette painted by Forearms: L ${String(r.tip.left).padStart(5)}%  R ${String(r.tip.right).padStart(5)}%`);
  }
}
await browser.close();
