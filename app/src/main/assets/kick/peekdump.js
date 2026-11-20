(function(){
  var out=[];
  function add(e,kind){var bs=e.querySelectorAll('button,[role=button]'),b=[];
    for(var j=0;j<bs.length&&j<6;j++)b.push({t:(bs[j].innerText||'').trim().slice(0,60),c:''});
    out.push({tag:kind+':'+e.tagName.toLowerCase(),c:(e.className&&e.className.toString?e.className.toString():'').slice(0,80),t:(e.innerText||'').trim().slice(0,300),b:b,h:e.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g,'[svg]').replace(/ (?:data-[a-z-]+|style)="[^"]*"/g,'').slice(0,2500)});}
  var sel='[role=dialog],[role=menu],[role=tooltip],[data-radix-popper-content-wrapper],[class*=popover i],[class*=modal i],[class*=dropdown i]';
  document.querySelectorAll(sel).forEach(function(e){if(out.length<4&&(e.innerText||'').trim())add(e,'popup')});
  document.querySelectorAll('[class*=pinned i]').forEach(function(e){if(out.length<7&&(e.innerText||'').trim())add(e,'pinned')});
  var re=/poll|prediction|توقع|تصويت|استطلاع/i;
  document.querySelectorAll('div,section').forEach(function(e){var t=(e.innerText||'').trim();
    if(out.length<9&&t&&t.length<400&&re.test(t)&&![].some.call(e.children,function(c){return re.test(c.innerText||'')}))add(e,'poll')});
  return JSON.stringify({n:out.length,items:out});
})()
