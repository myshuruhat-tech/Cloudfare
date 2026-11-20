(function(){
  var out=[];
  function hid(e){return e.getAttribute('aria-hidden')==='true'||e.getAttribute('data-aria-hidden')==='true'||e.hidden||/^chat-/.test(e.id||'')}
  function add(e,kind){
    var bs=e.querySelectorAll('button,[role=button]'),b=[];
    for(var j=0;j<bs.length&&j<6;j++)b.push({t:(bs[j].innerText||'').trim().slice(0,40),c:''});
    var h=e.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g,'[svg]').replace(/\s+/g,' ').slice(0,450);
    out.push({tag:kind+':'+e.tagName.toLowerCase(),c:(e.className&&e.className.toString?e.className.toString():'').slice(0,60),t:(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,300),b:b,h:h});
  }
  function ok(e){return !hid(e)&&(e.innerText||'').trim()}
  var sel='[role=dialog],[role=menu],[role=tooltip],[data-radix-popper-content-wrapper],[class*=popover i],[class*=modal i],[class*=dropdown i],[class*=sheet i],[class*=drawer i]';
  document.querySelectorAll(sel).forEach(function(e){if(out.length<3&&ok(e))add(e,'popup')});
  document.querySelectorAll('[class*=pinned i]').forEach(function(e){if(out.length<5&&ok(e))add(e,'pinned')});
  var re=/current poll|poll|prediction|predict|points contributed|your balance|توقع|تصويت|استطلاع/i;
  document.querySelectorAll('div,section').forEach(function(e){
    var t=(e.innerText||'').trim();
    if(out.length<7&&ok(e)&&t.length<500&&re.test(t)&&![].some.call(e.children,function(c){return re.test(c.innerText||'')}))add(e,'poll');
  });
  return JSON.stringify({n:out.length,items:out});
})()
