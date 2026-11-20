(function(){
  var out=[];
  function hid(e){return e.getAttribute('aria-hidden')==='true'||e.getAttribute('data-aria-hidden')==='true'||e.hidden||/^chat-/.test(e.id||'')}
  function ok(e){var t=(e.innerText||'').trim();return !hid(e)&&t&&!/^Your Privacy Choices/i.test(t)}
  function sk(e){
    var o=[],n=e.querySelectorAll('*'),cnt=0,skip={svg:1,path:1,circle:1,g:1,rect:1,use:1,line:1};
    for(var i=0;i<n.length&&cnt<45;i++){
      var x=n[i],tg=x.tagName.toLowerCase(); if(skip[tg])continue;
      var own='';for(var c=x.firstChild;c;c=c.nextSibling)if(c.nodeType===3)own+=c.textContent;
      own=own.replace(/\s+/g,' ').trim();
      var role=x.getAttribute('role'),tid=x.getAttribute('data-testid');
      if(!(tg==='button'||tg==='input'||tg==='a'||tg==='textarea'||role||x.id||tid||own))continue;
      var a=[tg];if(x.id)a.push('#'+x.id);if(role)a.push('[role='+role+']');if(tid)a.push('[tid='+tid+']');
      if(tg==='input')a.push('[type='+x.type+' ph='+(x.placeholder||'')+' val='+(x.value||'')+']');
      if(x.disabled)a.push('[disabled]');
      var cl=(x.className&&x.className.toString?x.className.toString().split(' ')[0]:'');
      o.push(a.join('')+(cl?'.'+cl.slice(0,25):'')+(own?' "'+own.slice(0,40)+'"':''));cnt++;
    }
    return o.join('\n').slice(0,1700);
  }
  function add(e,kind){
    var bs=e.querySelectorAll('button,[role=button]'),b=[];
    for(var j=0;j<bs.length&&j<8;j++)b.push({t:(bs[j].innerText||'').trim().replace(/\s+/g,' ').slice(0,40),c:''});
    out.push({tag:kind+':'+e.tagName.toLowerCase(),c:(e.id?'#'+e.id+' ':'')+(e.className&&e.className.toString?e.className.toString():'').slice(0,40),t:(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,260),b:b,h:sk(e)});
  }
  var sel='[role=dialog],[role=menu],[role=tooltip],[data-radix-popper-content-wrapper],[class*=popover i],[class*=sheet i],[class*=drawer i]';
  document.querySelectorAll(sel).forEach(function(e){if(out.length<3&&ok(e))add(e,'popup')});
  document.querySelectorAll('[class*=pinned i]').forEach(function(e){if(out.length<4&&ok(e))add(e,'pinned')});
  var re=/current poll|poll|prediction|predict|points contributed|your balance|توقع|تصويت|استطلاع/i;
  if(!out.length)document.querySelectorAll('div,section').forEach(function(e){
    var t=(e.innerText||'').trim();
    if(out.length<5&&ok(e)&&t.length<500&&re.test(t)&&![].some.call(e.children,function(c){return re.test(c.innerText||'')}))add(e,'poll');
  });
  return JSON.stringify({n:out.length,items:out});
})()
