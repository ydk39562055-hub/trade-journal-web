(function(){
  function link(value){
    if(!String(value||'').trim())return '';
    let u;try{u=new URL(value);}catch{throw new Error('트레이딩뷰 스냅샷 또는 차트 링크를 넣어 주세요.');}
    if(u.protocol!=='https:'||!['tradingview.com','www.tradingview.com'].includes(u.hostname)||!/^\/(x|chart)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)||u.username||u.password||u.port)throw new Error('https://www.tradingview.com/x/… 형태의 스냅샷 링크를 넣어 주세요.');
    u.search='';u.hash='';return u.href;
  }
  async function image(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('15MB 이하 PNG·JPG·WebP 이미지를 선택해 주세요.');
    const url=URL.createObjectURL(file),img=new Image();
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('이미지를 읽지 못했어요.'));img.src=url;});
      if(img.width*img.height>40000000)throw new Error('이미지 크기가 너무 커요. 차트 부분만 잘라서 넣어 주세요.');
      let width=Math.min(1600,img.width),data='';
      for(let i=0;i<4;i++){
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(img.height*width/img.width);
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',.82);
        if(data.length<=450000)return data;width=Math.floor(width*.8);
      }
      throw new Error('이미지 용량이 커요. 차트 부분만 잘라서 넣어 주세요.');
    }finally{URL.revokeObjectURL(url);}
  }
  const safeImage=value=>typeof value==='string'&&value.length<=450000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
  window.TJAttachments={link,image,safeImage};
})();
