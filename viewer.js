import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const $ = id => document.getElementById(id);
const config = window.MV_CONFIG || {};
const params = new URLSearchParams(location.search);
const id = params.get("id");
const book = $("book");
let flip = null;
const siteBase = location.pathname.replace(/\/invite\.html$/,"").replace(/\/$/,"");
const rawBase = `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch || "main")}`;
const rawUrl = path => `${rawBase}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function renderPages(pdf) {
  const pages = [];
  const stage = document.querySelector(".stage");
  const maxWidth = Math.max(260, Math.min(1000, stage.clientWidth));
  const maxHeight = Math.max(300, Math.min(680, stage.clientHeight));
  for (let n=1; n<=pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({scale:1});
    const scale = Math.min((maxWidth/2)/base.width, maxHeight/base.height, 1.6);
    const viewport = page.getViewport({scale});
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d",{alpha:false});
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width=Math.floor(viewport.width*dpr); canvas.height=Math.floor(viewport.height*dpr);
    canvas.style.width=`${Math.floor(viewport.width)}px`; canvas.style.height=`${Math.floor(viewport.height)}px`;
    await page.render({canvasContext:ctx,viewport,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
    pages.push(canvas);
  }
  return pages;
}
function controls() {
  if (!flip) return;
  const current=flip.getCurrentPageIndex()+1, total=flip.getPageCount();
  $("page-indicator").textContent=`Trang ${current} / ${total}`;
  $("previous").disabled=current<=1; $("following").disabled=current>=total;
}
try {
  if (!id || !config.owner || config.owner.startsWith("YOUR_") || !config.repo || config.repo.startsWith("YOUR_")) throw new Error("Chưa cấu hình website hoặc thiếu mã thư mời.");
  const response = await fetch(rawUrl(`invitations/${id}/invitation.json`));
  if (!response.ok) throw new Error("Không tìm thấy thư mời.");
  const meta = await response.json();
  $("event-title").textContent=meta.title || "Thư mời";
  $("event-meta").textContent=[meta.date,meta.venue].filter(Boolean).join(" · ");
  $("event-description").textContent=meta.description || "";
  if (meta.audio) {
    const audio=$("background-audio"); audio.src=rawUrl(meta.audio);
    $("audio-toggle").disabled=false;
    $("audio-toggle").addEventListener("click",async()=>{
      if(audio.paused){try{await audio.play();$("audio-toggle").innerHTML="♫ <span>Tắt nhạc</span>";}catch{alert("Trình duyệt chưa cho phép phát nhạc. Hãy chạm lại.");}}
      else{audio.pause();$("audio-toggle").innerHTML="♫ <span>Bật nhạc</span>";}
    });
  }
  const pdfResponse=await fetch(rawUrl(meta.pdf));
  if(!pdfResponse.ok) throw new Error("Không tải được file PDF.");
  const pdfData=await pdfResponse.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:pdfData}).promise;
  const pages=await renderPages(pdf);
  if(!window.St || !window.St.PageFlip) throw new Error("Không tải được thư viện lật trang. Hãy tải lại trang.");
  flip=new window.St.PageFlip(book,{width:560,height:720,size:"stretch",minWidth:280,maxWidth:1100,minHeight:320,maxHeight:1400,showCover:true,mobileScrollSupport:false,drawShadow:true,flippingTime:850,usePortrait:true,autoSize:true,maxShadowOpacity:.3,showPageCorners:true});
  flip.loadFromHTML(pages);
  flip.on("flip",controls);
  book.style.display="block";
  $("loading").hidden=true;
  controls();
} catch(err) {
  console.error(err); $("loading").hidden=true; $("error").hidden=false; $("error").textContent=err.message || "Không thể mở thư mời.";
}
$("previous").addEventListener("click",()=>flip?.flipPrev());
$("following").addEventListener("click",()=>flip?.flipNext());
$("fullscreen").addEventListener("click",async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else await document.exitFullscreen?.();});
