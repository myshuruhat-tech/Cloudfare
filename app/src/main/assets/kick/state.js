(function(){
  function T(e){return (e.innerText||e.textContent||'').trim()}
  function vis(e){var r=e.getBoundingClientRect();return r.width>=4&&r.height>=4}
  var out={poll:null,pinned:null};
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
  // ---- pinned message
  var pm=document.querySelector('[data-testid=pinned-message-content]');
  if(pm&&vis(pm)){var s=document.querySelector('[data-testid=sent-by]');out.pinned={text:T(pm).slice(0,400),sender:s?T(s).replace(/^sent by\s*/i,'').slice(0,40):''}}
  return JSON.stringify(out);
})()
