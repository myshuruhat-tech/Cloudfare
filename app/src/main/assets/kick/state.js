(function(){
  function T(e){return (e.innerText||e.textContent||'').trim()}
  function vis(e){var r=e.getBoundingClientRect();return r.width>=4&&r.height>=4}
  var out={poll:null,pinned:null,pred:null};
  // ---- poll: the box that holds the "poll-delete-button"/"poll-expand-collapse-button" or starts with "Current poll"
  var box=null,anchors=document.querySelectorAll('[data-testid=poll-expand-collapse-button],[data-testid=poll-delete-button]');
  if(anchors.length){for(var n=anchors[0].parentElement,i=0;n&&i<8;n=n.parentElement,i++){if(/%/.test(T(n))&&/\(\d+\)/.test(T(n))){box=n;break}}}
  if(!box){var ds=document.querySelectorAll('div');for(var d=0;d<ds.length;d++){var x=T(ds[d]);if(/^(current poll|poll ended)/i.test(x)&&/%/.test(x)&&/\(\d+\)/.test(x)&&x.length<600){box=ds[d];}}}
  if(box){
    var opts=[],bs=box.querySelectorAll('button');
    for(var j=0;j<bs.length;j++){var b=bs[j],tid=b.getAttribute('data-testid')||'';
      if(/poll-delete|poll-expand|collapse|delete/i.test(tid))continue;
      var m=T(b).split(/\n+/).map(function(s){return s.trim()}).filter(Boolean);
      if(m.length>=3&&/^\d+(\.\d+)?%$/.test(m[m.length-2])&&/^\(\d+\)$/.test(m[m.length-1]))
        opts.push({name:m.slice(0,m.length-2).join(' '),pct:parseFloat(m[m.length-2]),votes:parseInt(m[m.length-1].replace(/\D/g,''),10)||0,dis:!!b.disabled});
    }
    var lines=T(box).split(/\n+/).map(function(s){return s.trim()}).filter(Boolean),title='';
    for(var k=0;k<lines.length;k++){if(/^(current poll|poll ended|poll)$/i.test(lines[k])){title=lines[k+1]||'';break}}
    if(opts.length)out.poll={title:title.slice(0,120),ended:/poll ended/i.test(T(box).slice(0,40)),options:opts};
  }
  // ---- prediction card in chat: <ol> of <li><p>"1. yes"</p><span>amount</span></li>, header with title + Manage/Predict button, timer = scaleX bar
  var ols=document.querySelectorAll('ol');
  for(var o=0;o<ols.length&&!out.pred;o++){
    var lis=ols[o].querySelectorAll(':scope > li'),po=[];
    for(var q=0;q<lis.length;q++){var pp=lis[q].querySelector('p');if(!pp)continue;var mm=T(pp).match(/^(\d+)\.\s*(.+)$/);if(!mm)continue;
      var sp=lis[q].querySelector('span'),am=sp?T(sp):'';po.push({i:parseInt(mm[1],10),name:mm[2],amt:am})}
    if(!po.length||po.length!==lis.length)continue;
    var card=ols[o].parentElement;for(var u=0;u<4&&card&&!card.querySelector('p.line-clamp-2,p[class*=line-clamp]');u++)card=card.parentElement;
    if(!card)continue;
    var tp=card.querySelector('p[class*=line-clamp]'),act=card.querySelector('button span'),frac=null,bar=card.querySelector('.origin-left');
    if(bar){var tr=getComputedStyle(bar).transform;var mt=tr&&tr.match(/matrix\(([^,]+)/);if(mt)frac=parseFloat(mt[1]);else if(bar.style.width)frac=parseFloat(bar.style.width)/100}
    out.pred={title:tp?T(tp).slice(0,120):'',action:act?T(act).slice(0,20):'',options:po,t:frac,ended:/ended|distributed/i.test(T(card))}
  }
  // viewer card (no <ol>): header with title + "Predict" button and "<n> vs <n>" summary
  if(!out.pred){var pb=document.querySelectorAll('button');for(var z=0;z<pb.length&&!out.pred;z++){
    if(!/^(predict|توقع|توقّع)$/i.test(T(pb[z])))continue;
    var cd=pb[z].parentElement;for(var w=0;w<5&&cd&&!cd.querySelector('p');w++)cd=cd.parentElement;
    if(!cd)continue;var ttl=cd.querySelector('p');
    var sm=T(cd).replace(/\s+/g,' ');var mv=sm.match(/([\d.,KkMm]+)\s*vs\s*([\d.,KkMm]+)/i);
    out.pred={title:ttl?T(ttl).slice(0,120):'',action:T(pb[z]),options:[],summary:mv?mv[1]+' vs '+mv[2]:'',t:null,ended:false}}}
  // ---- pinned message
  var pm=document.querySelector('[data-testid=pinned-message-content]');
  if(pm&&vis(pm)){var s=document.querySelector('[data-testid=sent-by]');out.pinned={text:T(pm).slice(0,400),sender:s?T(s).replace(/^sent by\s*/i,'').slice(0,40):''}}
  return JSON.stringify(out);
})()
